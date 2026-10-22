// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-129 (v0.79.2) — the summary card's Finish Target date is saved when the field is left, never while it is typed.
 * Before v0.79.2 every change was written, and a browser reads a half-typed date as "" — so one Backspace in a part of
 * the date cleared it. A half-typed date reads "" with `validity.badInput` true; an emptied field reads "" with it false.
 * jsdom does not parse a date's parts, so a half-typed date is stood for by setting `validity` on the input; the first
 * test measures that this works. Expected values are written out, never computed.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import { ScenarioSummaryCard } from "./ScenarioSummaryCard";

afterEach(cleanup);

const STORED = "2026-12-18";

function renderCard(stored: string | null) {
  const onTargetFinishDateChange = vi.fn();
  const card = (
    <ScenarioSummaryCard
      startDate="2026-01-05"
      schedule={null}
      buffer={null}
      settings={DEFAULT_SCENARIO_SETTINGS}
      hasSimulationResults={false}
      onSettingsChange={vi.fn()}
      onStartDateChange={vi.fn()}
      onNewSeed={vi.fn()}
      projectName="Card"
      scenarioName="Baseline"
      activities={[]}
      bands={[]}
      dependencies={[]}
      milestones={[]}
      targetFinishDate={stored}
      onTargetFinishDateChange={onTargetFinishDateChange}
    />
  );
  const { rerender } = render(card);
  const input = document.querySelector('input[name="targetFinishDate"]') as HTMLInputElement;
  return { input, onTargetFinishDateChange, rerenderSame: () => rerender(card) };
}

/** What a browser reports for a date with a part deleted: "" and `badInput` true. */
function halfType(input: HTMLInputElement) {
  fireEvent.change(input, { target: { value: "" } });
  Object.defineProperty(input, "validity", { configurable: true, get: () => ({ badInput: true }) });
}

describe("typing the summary card's Finish Target date", () => {
  it("measurement: the stand-in for a half-typed date is what the card reads", () => {
    const { input } = renderCard(STORED);
    expect(input.validity.badInput, "jsdom's own reading").toBe(false);
    halfType(input);
    expect(input.value).toBe("");
    expect(input.validity.badInput).toBe(true);
  });

  it("1: a half-typed date, left — nothing saved, the stored date back; and it stays", () => {
    const { input, onTargetFinishDateChange, rerenderSame } = renderCard(STORED);
    fireEvent.focus(input);
    halfType(input);
    fireEvent.blur(input);
    expect(onTargetFinishDateChange).not.toHaveBeenCalled();
    expect(input.value).toBe("2026-12-18");

    Reflect.deleteProperty(input, "validity");
    rerenderSame();
    expect(input.value, "after the page draws the card again").toBe("2026-12-18");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onTargetFinishDateChange, "entered and left again, with no typing").not.toHaveBeenCalled();
    expect(input.value).toBe("2026-12-18");
  });

  it("2: an emptied field, left — a clear, once", () => {
    const { input, onTargetFinishDateChange } = renderCard(STORED);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onTargetFinishDateChange.mock.calls).toEqual([[null]]);
  });

  it("3: a new complete date, left — that date, once", () => {
    const { input, onTargetFinishDateChange } = renderCard(STORED);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2027-01-29" } });
    fireEvent.blur(input);
    expect(onTargetFinishDateChange.mock.calls).toEqual([["2027-01-29"]]);
  });

  it("4: nothing is saved while the date is typed, before the field is left", () => {
    const { input, onTargetFinishDateChange } = renderCard(STORED);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2026-12-01" } });
    halfType(input);
    Reflect.deleteProperty(input, "validity");
    fireEvent.change(input, { target: { value: "2026-12-03" } });
    fireEvent.change(input, { target: { value: "2026-12-31" } });
    expect(onTargetFinishDateChange).not.toHaveBeenCalled();
    expect(input.value).toBe("2026-12-31");
  });

  it("5: the stored date typed again, left — nothing saved", () => {
    const { input, onTargetFinishDateChange } = renderCard(STORED);
    fireEvent.focus(input);
    halfType(input);
    Reflect.deleteProperty(input, "validity");
    fireEvent.change(input, { target: { value: "2026-12-18" } });
    fireEvent.blur(input);
    expect(onTargetFinishDateChange).not.toHaveBeenCalled();
    expect(input.value).toBe("2026-12-18");
  });
});
