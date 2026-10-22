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
    expect(home).toContain("Explore intelligence");
    expect(home).toContain("View Risk Indices");
    expect(home).toContain("Visit the Store");
    expect(institution).toContain("For teams");
    expect(institution).toContain("Risk & strategy");
    expect(contact).not.toMatch(/testnet|Prediction Markets|Bridge and Swap/i);
    expect(institution).not.toMatch(/testnet|Prediction Markets|Bridge and Swap/i);
  });

  it("provides clear commercial conversion paths", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const contact = read("src/routes/contact.tsx");
    const institution = read("src/routes/institutional.tsx");
    expect(home).toContain("Ask Geomacro");
    expect(home).toContain("Visit the Store");
    expect(contact).toContain("Product & launch access");
    expect(contact).toContain("Support");
    expect(institution).toContain("Applications & agents");
  });
});
