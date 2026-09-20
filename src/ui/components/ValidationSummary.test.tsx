// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.71.1: the summary's line reads as an error message — the activity's number, its name, then
 * what is wrong with it.
 *
 * ⚠️ THE WIDTH CAP IS A LAYOUT PROPERTY AND JSDOM HAS NO LAYOUT, so what is pinned here is the
 * STRUCTURE that produces it: the name in its own element with the whole of it on `title`, and the
 * problem OUTSIDE the button, where a long name cannot displace it. The geometry — the problem
 * still on the first line with a name at the field's 200-character maximum — is measured in a
 * browser at 1280 and 853, and recorded in the PR.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ValidationSummary } from "./ValidationSummary";
import { lastScrollIntoView } from "../../test-stubs";
import type { ActivityProblem } from "@ui/hooks/use-estimate-validity";

const LONG_NAME =
  "Enterprise Resource Planning Global Template Design and Fit-Gap Analysis Workshop Series for Finance, Order-to-Cash and Record-to-Report across every region and legal entity";

const rows: ActivityProblem[] = [
  { id: "a-tamber", name: "Tamber sounding", messages: ["Min is above Most Likely"] },
  { id: "a-long", name: LONG_NAME, messages: ["Min is above Most Likely", "Most Likely is above Max"] },
  { id: "a-blank", name: "(unnamed)", messages: ["Min: Enter a number."] },
];

const numbers = new Map([
  ["a-tamber", 4],
  ["a-long", 14],
  ["a-blank", 16],
]);

/** The grid's own Name cell, which the jump looks for by selector. */
function plantNameCell(activityId: string): HTMLInputElement {
  const el = document.createElement("input");
  el.setAttribute("data-row-id", activityId);
  el.setAttribute("data-field", "name");
  document.body.append(el);
  return el;
}

const line = (name: string) => screen.getByTitle(name).closest("li")!;

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the validation summary's line", () => {
  it("leads with the activity's number, then its name, then the problem", () => {
    render(<ValidationSummary rows={rows} onRevealGrid={() => {}} activityNumberMap={numbers} />);

    expect(line("Tamber sounding").textContent).toBe("#4 Tamber sounding: Min is above Most Likely");
    expect(within(line("Tamber sounding")).getByText("#4")).toBeInTheDocument();
    // ⚠️ The click target is named for the ACTIVITY — its number and name — and not for the problem:
    // a screen reader announces "#4 Tamber sounding, button", and the sentence stays outside it.
    // (Measured: moving the problem inside the button also breaks three WI-63 tests that find this
    // button by its accessible name.)
    expect(screen.getByRole("button", { name: "#4 Tamber sounding" })).toBeInTheDocument();
  });

  it("shows no number when the project does not number its activities", () => {
    render(<ValidationSummary rows={rows} onRevealGrid={() => {}} activityNumberMap={null} />);

    expect(line("Tamber sounding").textContent).toBe("Tamber sounding: Min is above Most Likely");
    expect(screen.queryByText("#4")).toBeNull();
  });

  it("keeps the whole name reachable, and the problem out of its way", () => {
    render(<ValidationSummary rows={rows} onRevealGrid={() => {}} activityNumberMap={numbers} />);
    const li = line(LONG_NAME);
    const button = screen.getByTitle(LONG_NAME);

    // The full name is on the button, however narrowly it is drawn.
    expect(button).toHaveAttribute("title", LONG_NAME);
    // ⚠️ The problem is a SIBLING of the button, not inside it: this is what stops a long name
    // pushing it down the line, and it is the half jsdom can see.
    expect(button.textContent).toBe(`#14 ${LONG_NAME}`);
    expect(li.textContent).toBe(`#14 ${LONG_NAME}: Min is above Most Likely; Most Likely is above Max`);
    expect(within(li).getByText(": Min is above Most Likely; Most Likely is above Max")).toBeInTheDocument();
  });

  it("an unnamed activity keeps its number and stays clickable", () => {
    const cell = plantNameCell("a-blank");
    const reveal = vi.fn();
    render(<ValidationSummary rows={rows} onRevealGrid={reveal} activityNumberMap={numbers} />);

    expect(line("(unnamed)").textContent).toBe("#16 (unnamed): Min: Enter a number.");
    fireEvent.click(screen.getByTitle("(unnamed)"));

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(lastScrollIntoView()?.element).toBe(cell);
    expect(document.activeElement).toBe(cell);
  });

  it("renders nothing when no activity is flagged", () => {
    const { container } = render(
      <ValidationSummary rows={[]} onRevealGrid={() => {}} activityNumberMap={numbers} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
