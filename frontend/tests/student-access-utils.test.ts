import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "@/lib/student-access/cursor";
import { StudentAccessHttpError } from "@/lib/student-access/http";
import {
  assertIanaTimeZone,
  formatDateInTimeZone,
  getLocalDayUtcRange,
  getMonthUtcRange,
} from "@/lib/student-access/timezone";

describe("student access utils", () => {
  it("round-trips opaque session cursors", () => {
    const cursor = encodeCursor(75);

    expect(decodeCursor(cursor)).toBe(75);
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeCursor("definitely-not-a-cursor")).toThrow(StudentAccessHttpError);
    expect(() => decodeCursor("definitely-not-a-cursor")).toThrow("Please provide a valid cursor.");
  });

  it("computes month ranges in local time across DST boundaries", () => {
    const range = getMonthUtcRange("2026-03", "America/New_York");

    expect(range.start.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });

  it("computes local-day ranges across DST fallback", () => {
    const range = getLocalDayUtcRange("2026-11-01", "America/New_York");

    expect(range.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("formats dates in the requested time zone", () => {
    const value = formatDateInTimeZone(new Date("2026-04-03T01:30:00.000Z"), "America/New_York");

    expect(value).toBe("2026-04-02");
  });

  it("rejects invalid IANA time zones", () => {
    expect(() => assertIanaTimeZone("Mars/Base")).toThrow(StudentAccessHttpError);
    expect(() => assertIanaTimeZone("Mars/Base")).toThrow(
      "Please provide a valid IANA time zone.",
    );
  });
});
