import { describe, expect, it } from "vitest";
import { visiblePublisherText } from "@/lib/stateless-publisher-text";

describe("publisher HTML text extraction security", () => {
  it("ignores script/style/template contents even with HTML5 spaced close tags", () => {
    expect(visiblePublisherText(
      '<h1>Consumer Price Index</h1><script>Released: 2026-10-13</script\t\n evil>' +
      '<style>Released: 2026-10-13</style\t\n evil>' +
      '<template>Released: 2026-10-13</template><p>Released: 2026-10-12</p>',
    )).toBe("Consumer Price Index Released: 2026-10-12");
  });
  it("does not elevate script content in an unclosed script block", () => {
    expect(visiblePublisherText('<h1>Macro statistics</h1><script>Released: 2026-10-13'))
      .toBe("Macro statistics");
  });
  it("strips bounded benign markup for issuer-authored Atom HTML titles", () => {
    expect(visiblePublisherText("<span>Consumer Price Index</span>, <em>September 2026</em>"))
      .toBe("Consumer Price Index , September 2026");
  });
});
