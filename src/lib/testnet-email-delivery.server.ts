type EmailDeliveryInput = {
  to: string;
  verificationToken: string;
};

function canonicalEmail(value: string) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

export async function sendTestnetVerificationEmail(input: EmailDeliveryInput) {
  const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
  const from = String(process.env.TESTNET_EMAIL_FROM ?? "").trim();
  const publicSite = String(process.env.PUBLIC_SITE_URL ?? "https://geomacro.live")
    .trim()
    .replace(/\/+$/, "");

  if (!apiKey || !from) {
    throw new Error("TESTNET_EMAIL_DELIVERY_NOT_CONFIGURED");
  }

  const to = canonicalEmail(input.to);
  const token = String(input.verificationToken ?? "").trim();
  if (!/^gme_test_[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new Error("INVALID_EMAIL_VERIFICATION_TOKEN");
  }

  const verificationUrl = `${publicSite}/testnet-access?verify_email=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your Geomacro Testnet Tester email",
      html: `<p>Verify your email to continue the Geomacro Testnet Tester registration.</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires shortly. Geomacro will never ask for your wallet seed phrase or private key.</p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`TESTNET_EMAIL_DELIVERY_FAILED_${response.status}`);
  }

  return { delivered: true } as const;
}
