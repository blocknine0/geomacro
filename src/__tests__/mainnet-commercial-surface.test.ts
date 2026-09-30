import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("mainnet commercial website surface", () => {
  it("mounts customer care globally and escalates to the official email", () => {
    const root = read("src/routes/__root.tsx");
    const care = read("src/components/customer-care.tsx");

    expect(root).toContain("<CustomerCare />");
    expect(care).toContain('const EMAIL = "contact@geomacro.live"');
    expect(care).toContain("Customer Care");
    expect(care).toContain("What is live at launch?");
  });

  it("keeps core intelligence primary while launch status and technical proof stay on dedicated surfaces", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const contact = read("src/routes/contact.tsx");
    const institution = read("src/routes/institutional.tsx");

    expect(home).toContain("Explore Intelligence");
    expect(home).toContain("View Risk Indices");
    expect(home).toContain("Critical minerals & rare earths");
    expect(home).toContain("API & Agent Access");
    expect(home).not.toContain("Prediction Markets");
    expect(home).not.toContain("Bridge and Swap");
    expect(institution).toContain("Available at launch");
    expect(institution).toContain("Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices");
    expect(institution).toContain("Paid agent and x402 production access");
    expect(contact).toContain("Prediction Markets, Bridge and Swap remain separate testnet technical proofs");
    expect(institution).toContain("Prediction Markets, Bridge and Swap remain separate testnet technical proofs");
  });

  it("provides clear commercial conversion paths", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const contact = read("src/routes/contact.tsx");
    const institution = read("src/routes/institutional.tsx");

    expect(home).toContain("Contact Geomacro");
    expect(home).toContain("API & Agent Access");
    expect(contact).toContain("Commercial access");
    expect(contact).toContain("Customer support");
    expect(institution).toContain("Discuss commercial access");
  });
});
