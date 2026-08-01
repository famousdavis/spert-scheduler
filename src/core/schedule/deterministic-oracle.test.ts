// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// ORACLE — a pinned, behaviour-preserving contract for computeDependencySchedule.
//
// WHY THIS EXISTS
// C4 decomposes computeDependencySchedule (cognitive complexity 134) into seven
// lifted phases. The mutation net in deterministic.test.ts proves the tests are
// strong; this proves the OUTPUT is unchanged. It lands as its own PR, before
// C4 starts, so that it survives a C4 revert and the regression pass stays
// unconditional either way.
//
// HOW IT WORKS
// A fixture matrix is run through computeDependencySchedule and the full
// DeterministicSchedule for every case is compared against a committed JSON file.
// Any difference in any field of any activity fails the test with a readable diff.
//
// ⚠️ DELIBERATELY NOT A VITEST SNAPSHOT. `vitest -u` regenerates snapshots
// wholesale, which during C4 would silently absorb the exact behaviour change this
// file exists to catch. Regenerating here is an explicit act:
//
//     ORACLE_WRITE=1 npx vitest run src/core/schedule/deterministic-oracle.test.ts
//
// and the resulting diff must be reviewed. If C4 makes this file need regenerating,
// C4 is wrong.
//
// ⚠️ THIS FILE MUST STAY OUT OF `vitest.stryker.config.ts`'s include list.
// That list is an explicit 16-path allowlist, so it is excluded by default — keep
// it that way. Adding it after the C1 baseline was recorded would give the Weeks
// 5–6 mutation comparison more killing power than its own baseline, and the extra
// kills would mask C4-caused survivors: precisely the leniency the C4 gate exists
// to prevent.
//
// Every fixture is fully deterministic: fixed start dates, fixed min/mostLikely/max,
// no RNG and no reference to the current date.
// ===========================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { computeDependencySchedule } from "./deterministic";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type {
  Activity,
  ActivityDependency,
  ConstraintMode,
  ConstraintType,
  DependencyType,
  DeterministicSchedule,
  Milestone,
} from "@domain/models/types";

// Resolved from cwd (the repo root, where vitest.config.ts lives) rather than
// import.meta.url: under vitest's transform that is not a file:// URL, so
// new URL(...).pathname resolves against the filesystem root instead.
const ORACLE_PATH = resolve(process.cwd(), "src/core/schedule/deterministic-oracle.json");
const START = "2025-01-06"; // a Monday

function a(id: string, days: number, extra: Partial<Activity> = {}): Activity {
  return {
    id,
    name: id.toUpperCase(),
    min: days,
    mostLikely: days,
    max: days,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...extra,
  } as Activity;
}

/** An activity with a genuine spread, so percentile actually moves the duration. */
function spread(id: string, min: number, ml: number, max: number): Activity {
  return a(id, ml, { min, mostLikely: ml, max });
}

function dep(from: string, to: string, type: DependencyType, lagDays = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type, lagDays };
}

function constrained(id: string, days: number, type: ConstraintType, date: string, mode: ConstraintMode): Activity {
  return a(id, days, { constraintType: type, constraintDate: date, constraintMode: mode });
}

interface Case {
  name: string;
  activities: Activity[];
  deps: ActivityDependency[];
  milestones?: Milestone[];
  percentile?: number;
  calendar?: ReturnType<typeof buildWorkCalendar>;
}

const DEP_TYPES: DependencyType[] = ["FS", "SS", "FF"];
const CONSTRAINT_TYPES: ConstraintType[] = ["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"];
const MODES: ConstraintMode[] = ["hard", "soft"];

function buildCases(): Case[] {
  const cases: Case[] = [];

  // 1. Every dependency type across every lag sign, including lags deep enough
  //    to drive the successor back past the project start and trigger clamping.
  for (const type of DEP_TYPES) {
    for (const lag of [3, 0, -2, -10]) {
      cases.push({
        name: `${type} lag ${lag}`,
        activities: [a("p", 5), a("s", 3)],
        deps: [dep("p", "s", type, lag)],
      });
    }
  }

  // 2. Topologies: chain, parallel fan-out, fan-in, diamond, and a deeper chain
  //    where float and the critical path actually differ between activities.
  cases.push(
    { name: "single activity", activities: [a("only", 4)], deps: [] },
    {
      name: "chain of four",
      activities: [a("c1", 2), a("c2", 3), a("c3", 1), a("c4", 4)],
      deps: [dep("c1", "c2", "FS"), dep("c2", "c3", "FS"), dep("c3", "c4", "FS")],
    },
    {
      name: "fan-out then fan-in (diamond)",
      activities: [a("head", 2), a("left", 5), a("right", 2), a("tail", 3)],
      deps: [
        dep("head", "left", "FS"),
        dep("head", "right", "FS"),
        dep("left", "tail", "FS"),
        dep("right", "tail", "FS"),
      ],
    },
    {
      name: "parallel independents (no deps)",
      activities: [a("i1", 3), a("i2", 7), a("i3", 1)],
      deps: [],
    },
    {
      name: "mixed dependency types in one network",
      activities: [a("m1", 4), a("m2", 3), a("m3", 2), a("m4", 5)],
      deps: [
        dep("m1", "m2", "SS", 1),
        dep("m1", "m3", "FS", 0),
        dep("m2", "m4", "FF", 2),
        dep("m3", "m4", "FS", -1),
      ],
    },
  );

  // 3. Every constraint type in both modes, on the middle of a chain so both the
  //    forward apply and the backward adjustment are exercised.
  for (const type of CONSTRAINT_TYPES) {
    for (const mode of MODES) {
      cases.push({
        name: `constraint ${type} ${mode}`,
        activities: [a("b1", 2), constrained("b2", 3, type, "2025-01-09", mode), a("b3", 2)],
        deps: [dep("b1", "b2", "FS"), dep("b2", "b3", "FS")],
      });
    }
  }

  // 4. Constraints that force a genuine dependency violation.
  cases.push(
    {
      name: "hard MSO on successor forces an FS violation",
      activities: [a("v1", 5), constrained("v2", 2, "MSO", START, "hard")],
      deps: [dep("v1", "v2", "FS")],
    },
    {
      name: "hard MFO on successor forces an FF violation",
      activities: [a("v3", 5), constrained("v4", 3, "MFO", "2025-01-07", "hard")],
      deps: [dep("v3", "v4", "FF")],
    },
  );

  // 5. Milestone floors: later than the natural start (raises it), earlier
  //    (must not lower it), landing on a weekend (advances to Monday), and one
  //    activity naming the second of two milestones.
  const twoMilestones: Milestone[] = [
    { id: "ms-early", name: "Early", targetDate: "2025-01-08" },
    { id: "ms-late", name: "Late", targetDate: "2025-01-20" },
  ];
  cases.push(
    {
      name: "milestone floor raises the start",
      activities: [a("f1", 2), a("f2", 2, { startsAtMilestoneId: "ms-late" })],
      deps: [],
      milestones: twoMilestones,
    },
    {
      name: "milestone floor earlier than natural start is ignored",
      activities: [a("g1", 5), a("g2", 2, { startsAtMilestoneId: "ms-early" })],
      deps: [dep("g1", "g2", "FS")],
      milestones: twoMilestones,
    },
    {
      name: "milestone floor on a Saturday advances to Monday",
      activities: [a("h1", 2, { startsAtMilestoneId: "ms-weekend" })],
      deps: [],
      milestones: [{ id: "ms-weekend", name: "Weekend Gate", targetDate: "2025-01-11" }],
    },
    {
      name: "milestone floor combined with a hard constraint",
      activities: [
        a("k1", 3),
        constrained("k2", 2, "SNET", "2025-01-15", "hard"),
        a("k3", 2, { startsAtMilestoneId: "ms-late" }),
      ],
      deps: [dep("k1", "k2", "FS"), dep("k2", "k3", "SS", 1)],
      milestones: twoMilestones,
    },
  );

  // 6. Percentile actually moves durations only when there is a spread.
  for (const percentile of [0.1, 0.5, 0.95]) {
    cases.push({
      name: `percentile ${percentile} over spread estimates`,
      activities: [spread("q1", 2, 5, 12), spread("q2", 1, 3, 9)],
      deps: [dep("q1", "q2", "FS", 1)],
      percentile,
    });
  }

  // 7. Calendars: a four-day week, and a week containing a holiday.
  cases.push(
    {
      name: "four-day work week (Mon-Thu)",
      activities: [a("w1", 3), a("w2", 4)],
      deps: [dep("w1", "w2", "FS", 1)],
      calendar: buildWorkCalendar([1, 2, 3, 4], [], []),
    },
    {
      name: "holiday inside the span",
      activities: [a("y1", 3), a("y2", 3)],
      deps: [dep("y1", "y2", "FS")],
      calendar: buildWorkCalendar(
        [1, 2, 3, 4, 5],
        [{ id: "hol", name: "Holiday", startDate: "2025-01-08", endDate: "2025-01-08" }],
        [],
      ),
    },
    {
      name: "completed and in-progress activities",
      activities: [
        a("z1", 3, { status: "complete", actualDuration: 6 }),
        a("z2", 3, { status: "complete" }),
        a("z3", 4, { status: "inProgress", actualDuration: 2 }),
      ],
      deps: [dep("z1", "z2", "FS"), dep("z2", "z3", "FS")],
    },
  );

  return cases;
}

function runCase(c: Case): DeterministicSchedule {
  return computeDependencySchedule(
    c.activities,
    c.deps,
    START,
    c.percentile ?? 0.5,
    c.calendar,
    c.milestones,
  );
}

describe("computeDependencySchedule — pinned output oracle", () => {
  const cases = buildCases();
  const actual: Record<string, DeterministicSchedule> = {};
  for (const c of cases) actual[c.name] = runCase(c);

  if (process.env.ORACLE_WRITE === "1") {
    writeFileSync(ORACLE_PATH, JSON.stringify(actual, null, 2) + "\n");
  }

  it("the oracle file exists and covers every fixture", () => {
    expect(existsSync(ORACLE_PATH)).toBe(true);
    const expected = JSON.parse(readFileSync(ORACLE_PATH, "utf8")) as Record<string, DeterministicSchedule>;
    // Guards against a fixture being added without regenerating, and against a
    // fixture being silently dropped — either would quietly shrink the contract.
    expect(Object.keys(expected).sort()).toEqual(Object.keys(actual).sort());
  });

  it("every fixture name is unique", () => {
    // Duplicate names would collapse into one key and silently drop coverage.
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
  });

  it("the matrix is the expected size", () => {
    // A tripwire on the fixture set itself: if this number changes, the change
    // was either deliberate (update it) or an accident (find out why).
    expect(cases.length).toBe(41);
  });

  const expected = JSON.parse(readFileSync(ORACLE_PATH, "utf8")) as Record<string, DeterministicSchedule>;
  for (const c of cases) {
    it(`matches the pinned output: ${c.name}`, () => {
      expect(actual[c.name]).toEqual(expected[c.name]);
    });
  }
});
