import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("website runtime and shell regressions", () => {
  it("bounds the x402 health probe and exposes an explicit unavailable state", () => {
    const status = read("src/components/agent-commerce-status.tsx");

    expect(status).toContain('"unavailable"');
    expect(status).toContain("STATUS_TIMEOUT_MS = 6000");
    expect(status).toContain("window.setTimeout");
    expect(status).toContain("controller.abort()");
    expect(status).toContain("status unavailable");
  });

  it("lets route pages own the main landmark instead of nesting them inside the shell", () => {
    const shell = read("src/components/site-shell.tsx");
    const home = read("src/routes/index.tsx");

    expect(shell).toContain('<div id="main-content" className="flex-1">{children}</div>');
    expect(shell).not.toContain('<main id="main-content"');
    expect(home).toContain("function HomePage()");
    expect(home).toContain("<main>");
    expect(home).toContain("<CommercialHome />");
  });
});
