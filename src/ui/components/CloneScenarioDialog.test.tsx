// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-108 — the Clone Scenario window proposes a name no scenario has: "<source> (Copy)", then
 * "(Copy 2)" … — the rule a project's own clone follows (`nextCloneName`). The user can still type
 * any name, a taken one included. Each expected name is a literal.
 *
 * The window reads the names once, when it mounts; the PAGE mounts it only while it is open, and
 * `ProjectPage.test.tsx` opens it twice to pin that.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CloneScenarioDialog } from "./CloneScenarioDialog";
import { buildWorkCalendar, type WorkCalendar } from "@core/calendar/work-calendar";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { DateFormatPreference } from "@domain/models/types";

function open(existingNames: string[], onClone = vi.fn()) {
  render(
    <CloneScenarioDialog
      open={true}
      onOpenChange={vi.fn()}
      sourceName="Baseline"
      existingNames={existingNames}
      onClone={onClone}
    />
  );
  return { onClone, input: screen.getByLabelText("New Name") as HTMLInputElement };
}

describe("CloneScenarioDialog — the proposed name (WI-108)", () => {
  it("proposes 'Baseline (Copy)' when no scenario has that name", () => {
    expect(open(["Baseline", "Downside"]).input.value).toBe("Baseline (Copy)");
  });

  it("proposes 'Baseline (Copy 2)' once 'Baseline (Copy)' is taken", () => {
    expect(open(["Baseline", "Baseline (Copy)"]).input.value).toBe("Baseline (Copy 2)");
  });

  it("proposes 'Baseline (Copy 3)' when '(Copy)' and '(Copy 2)' are both taken", () => {
    expect(open(["Baseline", "Baseline (Copy)", "Baseline (Copy 2)"]).input.value).toBe("Baseline (Copy 3)");
  });

  it("the user can still type any name — a taken one too — and Clone sends it as typed", () => {
    const { onClone, input } = open(["Baseline", "Baseline (Copy)"]);
    fireEvent.change(input, { target: { value: "Baseline (Copy)" } });
    fireEvent.click(screen.getByRole("button", { name: "Clone" }));
    expect(onClone).toHaveBeenCalledWith("Baseline (Copy)", false);
  });
});

/**
 * WI-139 — ticking "Drop completed activities (reforecast)" shows a "Reforecast from" date beneath the
 * box, filled with the first working day AFTER today (local time) by the page's work calendar: the copy's
 * Start Date (owner, R608 — an Actual cell's own count includes today). While the name is the untouched
 * proposal it reads "<source> (Reforecast Oct 30)", in the user's Date Format; Clone is off, with the
 * reason beside it, while the date is empty. Unticked, the window is as before. The clock is faked;
 * every expected value is a literal.
 */
describe("CloneScenarioDialog — the reforecast date (WI-139)", () => {
  const TZ = process.env.TZ;
  const REASON = "Clone needs a date to reforecast from.";
  const NOTE =
    "The copy’s Start Date — the next working day by default, because an Actual cell counts today as a day worked. Each In Progress activity carries over its remaining work: its estimates reduced by the days in its Actual cell, so update those first.";
  /** Monday to Friday, with Thanksgiving 2026 (Thursday 26 November) a holiday. */
  const WEEKDAYS_THANKSGIVING: WorkCalendar = buildWorkCalendar(
    [1, 2, 3, 4, 5],
    [{ id: "h1", name: "Thanksgiving", startDate: "2026-11-26", endDate: "2026-11-26" }],
    []
  );

  function openReforecast(workCalendar: WorkCalendar | undefined = WEEKDAYS_THANKSGIVING, onClone = vi.fn()) {
    render(
      <CloneScenarioDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceName="Baseline"
        existingNames={["Baseline"]}
        onClone={onClone}
        workCalendar={workCalendar}
      />
    );
    return { onClone, input: screen.getByLabelText("New Name") as HTMLInputElement };
  }
  function setDateFormat(dateFormat: DateFormatPreference) {
    const { preferences } = usePreferencesStore.getState();
    usePreferencesStore.setState({ preferences: { ...preferences, dateFormat } });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 09:30 on Thursday 29 October 2026, local time (the suite runs in UTC).
    vi.setSystemTime(new Date(2026, 9, 29, 9, 30));
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = TZ;
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
  });

  const box = () => screen.getByRole("checkbox", { name: "Drop completed activities (reforecast)" });
  const dateField = () => screen.queryByLabelText("Reforecast from") as HTMLInputElement | null;
  const cloneButton = () => screen.getByRole("button", { name: "Clone" });

  it("unticked: no date field, as before", () => {
    openReforecast();
    expect(box()).not.toBeChecked();
    expect(dateField()).toBeNull();
  });

  it("ticked: a date field appears, filled with the next working day, described by the note", () => {
    openReforecast();
    fireEvent.click(box());
    expect(dateField()!.type).toBe("date");
    expect(dateField()!.value).toBe("2026-10-30");
    expect(dateField()).toHaveAccessibleDescription(NOTE);
  });

  it.each([
    ["Thursday 29 October", "2026-10-30", new Date(2026, 9, 29, 9, 30)],
    ["Friday 30 October", "2026-11-02", new Date(2026, 9, 30, 9, 30)],
    ["Saturday 31 October", "2026-11-02", new Date(2026, 9, 31, 9, 30)],
    ["Wednesday 25 November, the day before a holiday", "2026-11-27", new Date(2026, 10, 25, 9, 30)],
  ])("the default on %s is %s, the next working day by the page's calendar", (_day, expected, now) => {
    vi.setSystemTime(now);
    openReforecast();
    fireEvent.click(box());
    expect(dateField()!.value).toBe(expected);
  });

  it("a calendar with no working day ahead: today, rather than no window", () => {
    openReforecast(buildWorkCalendar([], [], []));
    fireEvent.click(box());
    expect(dateField()!.value).toBe("2026-10-29");
  });

  it("today is the LOCAL date: 20:38 on Wednesday 28 October in New York, already the 29th in UTC, gives 2026-10-29", () => {
    process.env.TZ = "America/New_York";
    vi.setSystemTime(new Date("2026-10-29T00:38:00Z"));
    // Control: at this instant, in this zone, the UTC date is the next day's.
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-29");
    openReforecast();
    fireEvent.click(box());
    expect(dateField()!.value).toBe("2026-10-29");
  });

  it("the untouched name follows the box and the date: '(Reforecast Oct 30)', then 'Nov 3', then '(Copy)' again", () => {
    const { input } = openReforecast();
    expect(input.value).toBe("Baseline (Copy)");
    fireEvent.click(box());
    expect(input.value).toBe("Baseline (Reforecast Oct 30)");
    fireEvent.change(dateField()!, { target: { value: "2026-11-03" } });
    expect(input.value).toBe("Baseline (Reforecast Nov 3)");
    fireEvent.click(box());
    expect(input.value).toBe("Baseline (Copy)");
  });

  it.each([
    ["MM/DD/YYYY", "Baseline (Reforecast Oct 30)"],
    ["DD/MM/YYYY", "Baseline (Reforecast 30 Oct)"],
    ["YYYY/MM/DD", "Baseline (Reforecast Oct 30)"],
  ] as const)("the name's date follows the Date Format setting: %s gives '%s'", (dateFormat, expected) => {
    setDateFormat(dateFormat);
    const { input } = openReforecast();
    fireEvent.click(box());
    expect(input.value).toBe(expected);
  });

  it("a typed name stays as typed through the box and the date", () => {
    const { input } = openReforecast();
    fireEvent.change(input, { target: { value: "Q4 replan" } });
    fireEvent.click(box());
    expect(input.value).toBe("Q4 replan");
    fireEvent.change(dateField()!, { target: { value: "2026-11-03" } });
    expect(input.value).toBe("Q4 replan");
  });

  it("ticked, Clone sends the name, true and the date", () => {
    const { onClone } = openReforecast();
    fireEvent.click(box());
    fireEvent.change(dateField()!, { target: { value: "2026-11-02" } });
    fireEvent.click(cloneButton());
    expect(onClone.mock.calls).toEqual([["Baseline (Reforecast Nov 2)", true, "2026-11-02"]]);
  });

  it("unticked, Clone sends the name and false, and no date at all", () => {
    const { onClone } = openReforecast();
    fireEvent.click(cloneButton());
    expect(onClone.mock.calls).toEqual([["Baseline (Copy)", false]]);
  });

  it("an empty date: Clone is off and the line beside it says why; unticking turns Clone back on", () => {
    const { onClone, input } = openReforecast();
    fireEvent.click(box());
    // Control: with the default date in the field, Clone is on and no reason shows.
    expect(cloneButton()).toBeEnabled();
    expect(screen.queryByText(REASON)).toBeNull();

    fireEvent.change(dateField()!, { target: { value: "" } });
    // The name keeps the last whole date while the field has none.
    expect(input.value).toBe("Baseline (Reforecast Oct 30)");
    expect(cloneButton()).toBeDisabled();
    expect(cloneButton()).toHaveAccessibleDescription(REASON);
    expect(dateField()).toHaveAttribute("aria-invalid", "true");
    // Enter in a field submits the form: still nothing is cloned.
    fireEvent.submit(cloneButton().closest("form")!);
    expect(onClone).not.toHaveBeenCalled();

    fireEvent.click(box());
    expect(cloneButton()).toBeEnabled();
    expect(screen.queryByText(REASON)).toBeNull();
  });
});
