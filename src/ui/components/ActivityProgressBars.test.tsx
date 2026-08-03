// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Branch coverage for `ActivityProgressBars` (§3.3, 2026-08-03).
 *
 * The function executed 46 times before this file existed — every one of them through
 * `ProjectPage.test.tsx`, in a single state. Its STATEMENTS looked reasonably covered;
 * its BRANCHES were at 27.7%. Code executed in exactly one state, where every other
 * state is unreached.
 *
 * ⚠️ COMPOSITION IS ASSERTED AS STRUCTURE, not as "both values appear somewhere". This
 * function combines counts into a visual bar and a `·`-joined tooltip — the same category
 * as v0.63.0's run-on banner, where every value-level assertion passed and the only
 * detector was a person reading the rendered output. So the tooltip is asserted as an
 * exact composed string, and each bar's width is read off its inline style.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Activity, ChecklistItem, DeliverableItem } from "@domain/models/types";
import { ActivityProgressBars } from "./UnifiedActivityRow";

const item = (id: string, completed: boolean): ChecklistItem => ({ id, text: id, completed });
const deliv = (id: string, completed: boolean): DeliverableItem => ({ id, text: id, completed });

/** A real Activity, annotated rather than cast. */
function activityWith(patch: Partial<Activity>): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 1,
    mostLikely: 2,
    max: 3,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...patch,
  } as Activity;
}

/** The rendered bars, in document order, as their inline width strings. */
function barWidths(c: HTMLElement): string[] {
  return Array.from(c.querySelectorAll<HTMLElement>("div[style*='width']")).map(
    (d) => d.style.width,
  );
}

describe("ActivityProgressBars — when it renders at all", () => {
  it("renders nothing when there are no tasks, deliverables or notes", () => {
    const { container } = render(<ActivityProgressBars activity={activityWith({})} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for EMPTY checklist and deliverables arrays, not just missing ones", () => {
    // `hasTasks` is `length > 0`, so an empty array must read the same as undefined.
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ checklist: [], deliverables: [] })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for whitespace-only notes", () => {
    // `hasNotes` trims — "   " must not count as having notes.
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ notes: "   " })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders for notes alone, with no bars", () => {
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ notes: "hello" })} />,
    );
    expect(container.firstChild).not.toBeNull();
    expect(barWidths(container)).toEqual([]);
  });
});

describe("ActivityProgressBars — bar geometry", () => {
  it("computes the tasks bar width as completed/total", () => {
    const { container } = render(
      <ActivityProgressBars
        activity={activityWith({ checklist: [item("1", true), item("2", false), item("3", false), item("4", false)] })}
      />,
    );
    expect(barWidths(container)).toEqual(["25%"]);
  });

  it("computes the deliverables bar width independently of tasks", () => {
    const { container } = render(
      <ActivityProgressBars
        activity={activityWith({
          checklist: [item("1", true), item("2", false)],
          deliverables: [deliv("d1", true), deliv("d2", true), deliv("d3", true), deliv("d4", false)],
        })}
      />,
    );
    // Order is tasks then deliverables; each reads its OWN counts.
    expect(barWidths(container)).toEqual(["50%", "75%"]);
  });

  it("renders a zero-width bar when nothing is complete, rather than a full one", () => {
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ checklist: [item("1", false), item("2", false)] })} />,
    );
    expect(barWidths(container)).toEqual(["0%"]);
  });

  it("renders a full bar when everything is complete", () => {
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ checklist: [item("1", true), item("2", true)] })} />,
    );
    expect(barWidths(container)).toEqual(["100%"]);
  });
});

describe("ActivityProgressBars — completion colouring", () => {
  const fillClasses = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLElement>("div[style*='width']")).map((d) => d.className);

  it("colours a fully-complete task bar green and an incomplete one blue", () => {
    const done = render(
      <ActivityProgressBars activity={activityWith({ checklist: [item("1", true)] })} />,
    );
    expect(fillClasses(done.container)[0]).toContain("bg-green-500");

    const partial = render(
      <ActivityProgressBars activity={activityWith({ checklist: [item("1", true), item("2", false)] })} />,
    );
    expect(fillClasses(partial.container)[0]).toContain("bg-blue-500");
  });

  it("colours a fully-complete deliverables bar green and an incomplete one indigo", () => {
    const done = render(
      <ActivityProgressBars activity={activityWith({ deliverables: [deliv("d1", true)] })} />,
    );
    expect(fillClasses(done.container)[0]).toContain("bg-green-500");

    const partial = render(
      <ActivityProgressBars activity={activityWith({ deliverables: [deliv("d1", false)] })} />,
    );
    expect(fillClasses(partial.container)[0]).toContain("bg-indigo-500");
  });
});

describe("ActivityProgressBars — the composed tooltip", () => {
  const title = (c: HTMLElement) => c.querySelector("div")?.getAttribute("title");

  it("joins tasks, deliverables and notes with a middot separator", () => {
    const { container } = render(
      <ActivityProgressBars
        activity={activityWith({
          checklist: [item("1", true), item("2", false)],
          deliverables: [deliv("d1", true)],
          notes: "n",
        })}
      />,
    );
    expect(title(container)).toBe("Tasks: 1/2 · Deliverables: 1/1 · Has notes");
  });

  it("omits absent sections WITHOUT leaving a dangling separator", () => {
    // The composition failure mode: filtering empties before joining. Asserted as the
    // exact string, because "contains Tasks: 1/2" would pass on " · Tasks: 1/2 · ".
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ checklist: [item("1", true), item("2", false)] })} />,
    );
    expect(title(container)).toBe("Tasks: 1/2");
  });

  it("composes notes alone with no separators", () => {
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ notes: "n" })} />,
    );
    expect(title(container)).toBe("Has notes");
  });

  it("composes deliverables and notes, skipping the absent tasks section", () => {
    const { container } = render(
      <ActivityProgressBars activity={activityWith({ deliverables: [deliv("d1", false)], notes: "n" })} />,
    );
    expect(title(container)).toBe("Deliverables: 0/1 · Has notes");
  });
});

describe("ActivityProgressBars — the edit affordance", () => {
  it("calls onEditActivity with the activity id when clicked", () => {
    const onEditActivity = vi.fn();
    const { container } = render(
      <ActivityProgressBars
        activity={activityWith({ id: "act-7", notes: "n" })}
        onEditActivity={onEditActivity}
      />,
    );
    (container.firstChild as HTMLElement).click();
    expect(onEditActivity).toHaveBeenCalledWith("act-7");
  });

  it("does not throw when clicked with no handler supplied", () => {
    const { container } = render(<ActivityProgressBars activity={activityWith({ notes: "n" })} />);
    expect(() => (container.firstChild as HTMLElement).click()).not.toThrow();
  });

  it("reserves trailing space only when the row is clickable", () => {
    const withHandler = render(
      <ActivityProgressBars activity={activityWith({ notes: "n" })} onEditActivity={vi.fn()} />,
    );
    expect((withHandler.container.firstChild as HTMLElement).className).toContain("pr-5");

    const without = render(<ActivityProgressBars activity={activityWith({ notes: "n" })} />);
    expect((without.container.firstChild as HTMLElement).className).not.toContain("pr-5");
  });
});
