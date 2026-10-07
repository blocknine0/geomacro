import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("commercial website surface", () => {
  it("mounts customer care globally and escalates to the official email", () => {
    expect(read("src/routes/__root.tsx")).toContain("<CustomerCare />");
    const care = read("src/components/customer-care.tsx");
    expect(care).toContain('const EMAIL = "contact@geomacro.live"');
    expect(care).toContain("What is live at launch?");
  });

  it("keeps core intelligence and commercial access primary", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const contact = read("src/routes/contact.tsx");
    const institution = read("src/routes/institutional.tsx");
    expect(home).toContain("Explore Intelligence");
    expect(home).toContain("View Risk Indices");
    expect(home).toContain("API & Agent Access");
    expect(institution).toContain("Available at launch");
    expect(institution).toContain("Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices");
    expect(contact).not.toMatch(/testnet|Prediction Markets|Bridge and Swap/i);
    expect(institution).not.toMatch(/testnet|Prediction Markets|Bridge and Swap/i);
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
