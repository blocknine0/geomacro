import {describe,expect,it} from "vitest";
import {officialItemNativePublicationMs} from "../../scripts/lib/official-native-item-publication-date.mjs";

describe("source-original RSS and Atom publisher clocks",()=>{
  it("keeps genuine timezone-aware original RSS/Atom dates unchanged",()=>{
    const examples=[
      ["Thu, 15 Oct 2026 06:20:00 GMT","2026-10-15T06:20:00.000Z"],
      ["Thu, 15 Oct 2026 02:20:00 EDT","2026-10-15T06:20:00.000Z"],
      ["15 Oct 2026 06:20:00 +0000","2026-10-15T06:20:00.000Z"],
      ["2026-10-15T06:20:00Z","2026-10-15T06:20:00.000Z"],
      ["2026-10-15T08:20:00+02:00","2026-10-15T06:20:00.000Z"],
      ["<![CDATA[Thu, 15 Oct 2026 06:20:00 GMT]]>","2026-10-15T06:20:00.000Z"],
    ] as const;
    for(const [clock,expected] of examples)
      expect(new Date(officialItemNativePublicationMs(clock)).toISOString()).toBe(expected);
  });
  it("does not infer original publication from date-only, local/no-zone, invalid or impossible clocks",()=>{
    const invalid=[
      "2026-10-15","2026-10-15T06:20:00","Oct 15, 2026",
      "2026-02-30T06:20:00Z","Thu, 30 Feb 2026 06:20:00 GMT",
      "Wed, 15 Oct 2026 06:20:00 GMT",
      "Thu, 15 Oct 2026 06:20:00 QQQ",
      "Thu, 15 Oct 2026 06:20:00 +1460",
      "2026-10-15T06:20:00+24:00",
      "2026-10-15T06:20:00+14:01",
      "2026-10-15T24:20:00Z",
      "2026-10-15T06:20:60Z",
      "<updated>2026-10-15T06:20:00Z</updated>",
      "<![CDATA[2026-10-15T06:20:00Z]]>trailing",
    ];
    for(const date of invalid)expect(officialItemNativePublicationMs(date)).toBeNaN();
  });
});