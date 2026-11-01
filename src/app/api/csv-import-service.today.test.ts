// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePastedRows } from "./csv-import-service";

/**
 * WI-150 (Review 34, V-G4): "after today" is the COMPUTER'S local date. vitest pins TZ=UTC, so each
 * case sets its own zone and asserts the offset took effect before reading a result. Each instant
 * is a UTC time whose local date differs from its UTC date.
 */
const HEADER = ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start"];
const errorsFor = (start: string) =>
  parsePastedRows([HEADER, ["A1", "Design", "2", "3", "5", "", "In Progress", start]]).errors.map((e) => e.message);

const ZONE_CASES: { zone: string; utc: number; offset: number; localToday: string; localTomorrow: string }[] = [
  // Kiritimati (UTC+14) at local 00:30 on Sat 31 Oct: still Fri 30 Oct in UTC.
  { zone: "Pacific/Kiritimati", utc: Date.UTC(2026, 9, 30, 10, 30), offset: -840, localToday: "2026-10-31", localTomorrow: "2026-11-01" },
  // Kolkata (UTC+5:30) at local 00:15 on Sat 31 Oct: still Fri 30 Oct in UTC.
  { zone: "Asia/Kolkata", utc: Date.UTC(2026, 9, 30, 18, 45), offset: -330, localToday: "2026-10-31", localTomorrow: "2026-11-01" },
  // Los Angeles (UTC−7) at local 23:30 on Fri 30 Oct: already Sat 31 Oct in UTC.
  { zone: "America/Los_Angeles", utc: Date.UTC(2026, 9, 31, 6, 30), offset: 420, localToday: "2026-10-30", localTomorrow: "2026-10-31" },
];

const savedTZ = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = savedTZ;
});

describe("an Actual Start on the computer's local today is never after today (V-G4)", () => {
  for (const c of ZONE_CASES) {
    it(`${c.zone}: ${c.localToday} accepted, ${c.localTomorrow} refused`, () => {
      process.env.TZ = c.zone;
      vi.useFakeTimers({ now: c.utc, toFake: ["Date"] });
      expect(new Date().getTimezoneOffset()).toBe(c.offset);
      expect(errorsFor(c.localToday)).toEqual([]);
      expect(errorsFor(c.localTomorrow)).toEqual([
        `Actual Start "${c.localTomorrow}" is after today. An actual date cannot be in the future.`,
      ]);
    });
  }
});
