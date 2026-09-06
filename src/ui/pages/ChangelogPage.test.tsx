// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChangelogPage } from "./ChangelogPage";
import { CHANGELOG } from "./changelog-data";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { DateFormatPreference } from "@domain/models/types";

/**
 * Release dates keep a spelled-out month (a month name has no day/month ambiguity, so
 * the numeric preference would be a strict loss for the default reader — orchestrator
 * ruling R54, 2026-09-06, declining the item's "honour the preference" line). What the
 * preference DOES decide is the order: a DD/MM/YYYY reader gets "6 September 2026", the
 * other two keep "September 6, 2026".
 *
 * The entry under test is the newest whose day and month differ, so the two orderings
 * cannot coincide. The shapes are asserted structurally (day-first vs month-first), not
 * by re-running the page's own formatter. Falsified at 1c9b1db: the DD/MM/YYYY case
 * fails (the page rendered en-US for every preference); the other two are the
 * must-not-move half.
 */
const setFormat = (dateFormat: DateFormatPreference) =>
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat },
  });

/** Newest entry whose day ≠ month — the only kind of date the two orderings disagree on. */
function discriminatingEntry() {
  const entry = CHANGELOG.find((e) => {
    const [, m, d] = e.date.split("-");
    return m !== d;
  });
  if (!entry) throw new Error("no changelog entry with day ≠ month — fixture cannot discriminate");
  return entry;
}

function renderedDate(): string {
  const entry = discriminatingEntry();
  render(
    <MemoryRouter>
      <ChangelogPage />
    </MemoryRouter>
  );
  const heading = screen.getByRole("heading", { level: 2, name: `v${entry.version}` });
  return heading.parentElement!.textContent!.replace(`v${entry.version}`, "").trim();
}

const MONTH_FIRST = /^[A-Z][a-z]+ \d{1,2}, \d{4}$/; // "September 6, 2026"
const DAY_FIRST = /^\d{1,2} [A-Z][a-z]+ \d{4}$/; // "6 September 2026"

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});
afterEach(cleanup);

describe("ChangelogPage release dates", () => {
  it("premise: the fixture entry's day and month differ", () => {
    const [, m, d] = discriminatingEntry().date.split("-");
    expect(m).not.toBe(d);
  });

  it("spell the month, month first, for the default MM/DD/YYYY preference", () => {
    setFormat("MM/DD/YYYY");
    expect(renderedDate()).toMatch(MONTH_FIRST);
  });

  it("spell the month, DAY first, for the DD/MM/YYYY preference", () => {
    setFormat("DD/MM/YYYY");
    expect(renderedDate()).toMatch(DAY_FIRST);
  });

  it("spell the month, month first, for the YYYY/MM/DD preference (no year-first long form exists)", () => {
    setFormat("YYYY/MM/DD");
    expect(renderedDate()).toMatch(MONTH_FIRST);
  });

  it("keeps its Back to Projects link (the twin AboutPage.test.tsx asserts for About)", () => {
    render(
      <MemoryRouter>
        <ChangelogPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /back to projects/i })).toHaveAttribute("href", "/projects");
  });
});
