// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  compareRunNote,
  flagNote,
  scheduleErrorKind,
  validationErrorsHeading,
  type FlagNote,
  type FlagNoteInput,
} from "./flag-sentences";

/**
 * WI-58 — the owner's words for a flagged scenario, pinned as EXACT strings written out here, never
 * computed by calling the builder (owner rulings, 2026-09-27). A reworded sentence must fail this file.
 */

const OCM = { label: "#7 Organizational Change Management Program", messages: ["Min is above Most Likely"] };
const GDW = { label: "#8 Global Design Workshops & Fit-Gap Analysis", messages: ["Min is above Most Likely"] };
const MDG = { label: "#9 Master Data Governance & Standards", messages: ["Most Likely is above Max"] };
const INT = { label: "#10 Integration Design", messages: ["Most Likely is above Max"] };
const FIN = { label: "#11 Financials Solution Design", messages: ["Min is above Most Likely"] };

const input = (over: Partial<FlagNoteInput>): FlagNoteInput => ({
  scenarioName: "Fast-track",
  rows: [OCM],
  anyStops: false,
  errorKind: "none",
  ...over,
});

/** The single-row Compare note as it reads on screen: one run of sentences. */
const inline = (n: FlagNote) => [n.heading, ...n.rows, n.consequence].join(" ");

describe("Compare notes", () => {
  it("W3 — a flag that does not stop the schedule", () => {
    expect(inline(flagNote(input({}), "compare"))).toBe(
      "Fast-track: 1 activity has validation errors. #7 Organizational Change Management Program: Min is above Most Likely. It cannot be simulated until this is fixed."
    );
  });

  it("W4 — ONE flagged row that stops the schedule, when the schedule's error IS that estimate", () => {
    const note = flagNote(input({ scenarioName: "Aggressive", rows: [GDW], anyStops: true, errorKind: "estimate" }), "compare");
    expect(inline(note)).toBe(
      "Aggressive: 1 activity has validation errors. #8 Global Design Workshops & Fit-Gap Analysis: Min is above Most Likely. Its schedule cannot be calculated until this is fixed."
    );
  });

  it("W4-d — two or more rows, any of which stops it: each row on its own line, then two sentences", () => {
    const note = flagNote(input({ scenarioName: "Stretch", rows: [OCM, GDW, INT], anyStops: true, errorKind: "estimate" }), "compare");
    expect(note).toEqual({
      heading: "Stretch: 3 activities have validation errors.",
      rows: [
        "#7 Organizational Change Management Program: Min is above Most Likely.",
        "#8 Global Design Workshops & Fit-Gap Analysis: Min is above Most Likely.",
        "#10 Integration Design: Most Likely is above Max.",
      ],
      more: null,
      consequence: "Its schedule cannot be calculated. It cannot be simulated until these are fixed.",
    });
  });

  it("P-a — W3's plural: 'until these are fixed'", () => {
    const note = flagNote(input({ rows: [OCM, MDG] }), "compare");
    expect(note.heading).toBe("Fast-track: 2 activities have validation errors.");
    expect(note.consequence).toBe("It cannot be simulated until these are fixed.");
  });

  it("P-b — at most three rows, then 'and N more.'", () => {
    const note = flagNote(input({ rows: [OCM, GDW, MDG, INT, FIN], anyStops: true, errorKind: "estimate" }), "compare");
    expect(note.rows).toHaveLength(3);
    expect(note.more).toBe("and 2 more.");
  });

  it("a cycle or a calendar error: the rows stop the SIMULATION only (W3's words), even when one of them stops the schedule", () => {
    for (const errorKind of ["cycle", "calendar"] as const) {
      const note = flagNote(input({ rows: [GDW], anyStops: true, errorKind }), "compare");
      expect(note.consequence).toBe("It cannot be simulated until this is fixed.");
    }
  });

  it("'any stops' alone is not enough: a stopping row under no estimate error keeps W3's words", () => {
    expect(flagNote(input({ rows: [GDW], anyStops: true, errorKind: "none" }), "compare").consequence).toBe(
      "It cannot be simulated until this is fixed."
    );
  });

  it("a row whose last message already ends with a period takes no second one", () => {
    const note = flagNote(input({ rows: [{ label: "#7 OCM", messages: ["Min: Enter 0 or more."] }] }), "compare");
    expect(note.rows).toEqual(["#7 OCM: Min: Enter 0 or more."]);
  });

  it("joins several messages of one row with '; ', as the summary does", () => {
    const note = flagNote(
      input({ rows: [{ label: "Uniform row", messages: ["Min is above Most Likely", "Most Likely is above Max"] }] }),
      "compare"
    );
    expect(note.rows).toEqual(["Uniform row: Min is above Most Likely; Most Likely is above Max."]);
  });
});

describe("the print box", () => {
  it("W6 — the summary's heading and line, no period, then the consequence", () => {
    expect(flagNote(input({}), "print")).toEqual({
      heading: "1 activity has validation errors",
      rows: ["#7 Organizational Change Management Program: Min is above Most Likely"],
      more: null,
      consequence: "This scenario cannot be simulated until this is fixed.",
    });
  });

  it("P-a — W6's plain plural", () => {
    const note = flagNote(input({ rows: [OCM, MDG] }), "print");
    expect(note.heading).toBe("2 activities have validation errors");
    expect(note.consequence).toBe("This scenario cannot be simulated until these are fixed.");
  });

  it("W6-c (P-c) — ONE row that stops it, under the estimate error", () => {
    expect(flagNote(input({ rows: [GDW], anyStops: true, errorKind: "estimate" }), "print").consequence).toBe(
      "This scenario's schedule cannot be calculated until this is fixed."
    );
  });

  it("W6-d — two or more rows, any of which stops it", () => {
    expect(flagNote(input({ rows: [OCM, GDW], anyStops: true, errorKind: "estimate" }), "print").consequence).toBe(
      "This scenario's schedule cannot be calculated. It cannot be simulated until these are fixed."
    );
  });

  it("lists EVERY row — no 'and N more' on paper", () => {
    const note = flagNote(input({ rows: [OCM, GDW, MDG, INT, FIN], anyStops: true, errorKind: "estimate" }), "print");
    expect(note.rows).toHaveLength(5);
    expect(note.more).toBeNull();
  });

  it("a cycle keeps W6's plain line", () => {
    expect(flagNote(input({ rows: [GDW], anyStops: true, errorKind: "cycle" }), "print").consequence).toBe(
      "This scenario cannot be simulated until this is fixed."
    );
  });
});

describe("the grey run note (W5)", () => {
  it("today's words only when every compared scenario can run", () => {
    expect(compareRunNote(["Baseline"], true)).toBe("Run simulation on all scenarios for complete comparison data.");
  });
  it("otherwise names the one that can", () => {
    expect(compareRunNote(["Baseline"], false)).toBe("Run simulation on Baseline to add its results to the comparison.");
  });
  it("and two by name", () => {
    expect(compareRunNote(["Baseline", "Plan B"], false)).toBe(
      "Run simulation on Baseline and Plan B to add their results to the comparison."
    );
  });
  it("nothing when no unrun scenario can run", () => {
    expect(compareRunNote([], false)).toBeNull();
    expect(compareRunNote([], true)).toBeNull();
  });
});

describe("the error's kind — the banner's precedence", () => {
  it("cycle, then calendar, then an estimate only with a stopping row", () => {
    expect(scheduleErrorKind(null, true)).toBe("none");
    expect(scheduleErrorKind({ isCycleError: true, isCalendarError: true }, true)).toBe("cycle");
    expect(scheduleErrorKind({ isCycleError: false, isCalendarError: true }, true)).toBe("calendar");
    expect(scheduleErrorKind({ isCycleError: false, isCalendarError: false }, true)).toBe("estimate");
    expect(scheduleErrorKind({ isCycleError: false, isCalendarError: false }, false)).toBe("other");
  });
});

describe("the heading", () => {
  it("is the summary's", () => {
    expect(validationErrorsHeading(1)).toBe("1 activity has validation errors");
    expect(validationErrorsHeading(2)).toBe("2 activities have validation errors");
  });
});
