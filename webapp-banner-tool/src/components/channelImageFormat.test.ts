import { describe, expect, it } from "vitest";
import { formatImageSize, formatImageUpdated } from "./channelImageFormat";

describe("formatImageSize", () => {
  it("reads bytes, kilobytes and megabytes", () => {
    expect(formatImageSize(812)).toBe("812 B");
    expect(formatImageSize(18_431)).toBe("18 KB");
    expect(formatImageSize(1_468_006)).toBe("1.4 MB");
  });

  it("has no value without a size", () => {
    expect(formatImageSize(undefined)).toBeNull();
    expect(formatImageSize(Number.NaN)).toBeNull();
  });
});

describe("formatImageUpdated", () => {
  const now = new Date(2026, 10, 15, 16, 30);

  it("names today and yesterday, otherwise the date", () => {
    expect(formatImageUpdated(new Date(2026, 10, 15, 14, 2).toISOString(), now)).toBe(
      "Today, 14:02",
    );
    expect(formatImageUpdated(new Date(2026, 10, 14, 21, 47).toISOString(), now)).toBe(
      "Yesterday, 21:47",
    );
    expect(formatImageUpdated(new Date(2026, 10, 3, 9, 15).toISOString(), now)).toBe(
      "3 Nov 2026, 09:15",
    );
  });

  it("has no value without a valid time", () => {
    expect(formatImageUpdated(undefined, now)).toBeNull();
    expect(formatImageUpdated("not a date", now)).toBeNull();
  });
});
