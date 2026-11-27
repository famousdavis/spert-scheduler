// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-174 (v0.87.0) at the PAGE: every calendar on the Calendar page is one line, closed, with what it holds beside
 * its name; a project's page links to its own line by `?project=<id>`.
 *
 * Everything here runs the REAL page, row, holiday editor and converted-work-day editor against the real stores.
 * Only the storage mode (the provider needs a signed-in session) and the network (Nager's country list, counted)
 * are faked.
 *
 * ⚠️ jsdom has no layout, so two things are browser checks, measured in Chrome for the release: that a linked row
 * lands BELOW the sticky header (here only the `scroll-mt-20` that does it), and that the spoken commas take no
 * room on screen. jsdom applies no stylesheet: it reads the `hidden` ATTRIBUTE as hidden, which is what the rows use.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const storage = vi.hoisted(() => ({ mode: "local" as "local" | "cloud", storageReady: true }));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: () => storage,
}));
const nager = vi.hoisted(() => ({
  fetchAvailableCountries: vi.fn(() => Promise.resolve([{ countryCode: "US", name: "United States" }])),
  fetchPublicHolidays: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@infrastructure/nager/nager-client", () => nager);

import { CalendarPage } from "./CalendarPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { createProject } from "@app/api/project-service";
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import { DEFAULT_USER_PREFERENCES, type Holiday, type Project } from "@domain/models/types";
import { scrollIntoViewCallLog } from "../../test-stubs";

// Names that appear in no component's static text.
const OSSORY = "Ossory Causeway";
const TAMBER = "Tamber Works";
const WRASSE = "Wrasse Survey";

// 2026-11-26 is a Thursday (company Thanksgiving here); 11-28 and 12-05 are Saturdays.
const THANKSGIVING: Holiday = { id: "h-thanks", name: "Thanksgiving", startDate: "2026-11-26", endDate: "2026-11-26" };
const WINTER_SHUTDOWN: Holiday = { id: "h-winter", name: "Winter Shutdown", startDate: "2026-12-24", endDate: "2026-12-31" };
const OFFSITE: Holiday = { id: "h-offsite", name: "Team offsite", startDate: "2026-10-14", endDate: "2026-10-15" };

function project(name: string, patch: Partial<Project> = {}): Project {
  return { ...createProject(name, "2026-04-06"), ...patch };
}

/** Ossory: 1 holiday, 2 converted work days in effect. Tamber: nothing. Wrasse: one of its 2 is a company holiday. */
function threeProjects(): Project[] {
  return [
    project(OSSORY, { globalCalendarOverride: { holidays: [OFFSITE] }, convertedWorkDays: ["2026-11-28", "2026-12-05"] }),
    project(TAMBER),
    project(WRASSE, { convertedWorkDays: ["2026-11-26"], forcedWorkDays: ["2026-11-28"] }),
  ];
}

function setCompanyHolidays(holidays: Holiday[]) {
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, globalCalendar: { holidays } },
  });
}

function renderAt(url = "/calendar") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** A row's button, found by the start of its accessible name (the name, then a comma, then the summary). */
const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const bodyOf = (button: HTMLElement) => document.getElementById(button.getAttribute("aria-controls")!)!;
const holidayNameInputs = () => screen.queryAllByLabelText("Holiday Name");
const overrideInputs = () => screen.queryAllByLabelText("Work day override date");

/** A cloud session's first load: the list is empty and the pages hold their loads back, as `useCloudSync` does. */
function startCloudFirstLoad() {
  storage.mode = "cloud";
  useProjectStore.setState({ projects: [], cloudDataLoaded: false, cloudSyncActive: true, cloudSyncReady: false });
}
function endCloudFirstLoad(projects: Project[]) {
  act(() => {
    useProjectStore.setState({ projects, cloudDataLoaded: true, cloudSyncReady: true });
  });
}

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
  storage.mode = "local";
  storage.storageReady = true;
  nager.fetchAvailableCountries.mockClear();
  useProjectStore.setState({
    projects: [],
    loadError: false,
    cloudDataLoaded: false,
    cloudSyncActive: false,
    cloudSyncReady: false,
  });
  setCompanyHolidays([THANKSGIVING, WINTER_SHUTDOWN]);
  (document.activeElement as HTMLElement | null)?.blur();
});

afterEach(() => {
  cleanup();
  setStorageNamespace("local");
});

describe("WI-174: every calendar is one line, closed", () => {
  it("with three projects, Company Holidays and every project's row start closed, and no editor is mounted", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();

    for (const name of ["Company Holidays", OSSORY, TAMBER, WRASSE]) {
      expect(row(name)).toHaveAttribute("aria-expanded", "false");
      expect(bodyOf(row(name))).not.toBeVisible();
    }
    expect(holidayNameInputs()).toHaveLength(0);
    expect(overrideInputs()).toHaveLength(0);
    expect(nager.fetchAvailableCountries).not.toHaveBeenCalled();
  });

  it("Company Holidays' row is the section's h2 and each project's row an h3 beneath it (D1)", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    // By prefix: jsdom names a heading from its text, where Chrome 154 takes its button's label, comma and all.
    expect(screen.getByRole("heading", { level: 2, name: /^Company Holidays\b/ })).toContainElement(row("Company Holidays"));
    for (const name of [OSSORY, TAMBER, WRASSE]) {
      expect(screen.getByRole("heading", { level: 3, name: new RegExp(`^${name}\\b`) })).toContainElement(row(name));
    }
  });

  it("a click opens a row, and a second click closes it; aria-controls names the body it shows", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();

    fireEvent.click(row(TAMBER));
    expect(row(TAMBER)).toHaveAttribute("aria-expanded", "true");
    expect(bodyOf(row(TAMBER))).toBeVisible();
    expect(within(bodyOf(row(TAMBER))).getByLabelText("Work day override date")).toBeVisible();
    expect(row(OSSORY)).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(row(TAMBER));
    expect(row(TAMBER)).toHaveAttribute("aria-expanded", "false");
    expect(bodyOf(row(TAMBER))).not.toBeVisible();
  });

  it("a row's editors mount the first time it opens: only the opened row fetches the country list", async () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();

    fireEvent.click(row(WRASSE));
    await act(async () => {});
    expect(holidayNameInputs()).toHaveLength(1);
    expect(overrideInputs()).toHaveLength(1);
    expect(nager.fetchAvailableCountries).toHaveBeenCalledTimes(1);
  });

  it("closing a row keeps what was typed in it, and a confirmation waiting in it", async () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();

    fireEvent.click(row(TAMBER));
    const body = bodyOf(row(TAMBER));
    fireEvent.change(within(body).getByLabelText("Holiday Name"), { target: { value: "Half-typed offsite" } });
    // 11/26 is a company holiday, so Add asks first.
    fireEvent.change(within(body).getByLabelText("Work day override date"), { target: { value: "2026-11-26" } });
    fireEvent.click(within(body).getByRole("button", { name: "Add" }));
    expect(within(body).getByRole("button", { name: /^Convert 11\/26\/2026 to a work day/ })).toBeVisible();

    fireEvent.click(row(TAMBER));
    expect(body).not.toBeVisible();
    fireEvent.click(row(TAMBER));
    await act(async () => {});

    expect(within(body).getByLabelText("Holiday Name")).toHaveValue("Half-typed offsite");
    expect(within(body).getByRole("button", { name: /^Convert 11\/26\/2026 to a work day/ })).toBeVisible();
    expect(nager.fetchAvailableCountries).toHaveBeenCalledTimes(1);
  });

  it("rows start closed on every visit: a row opened on one visit is closed on the next", () => {
    useProjectStore.setState({ projects: threeProjects() });
    const first = renderAt();
    fireEvent.click(row(OSSORY));
    expect(row(OSSORY)).toHaveAttribute("aria-expanded", "true");
    first.unmount();

    renderAt();
    expect(row(OSSORY)).toHaveAttribute("aria-expanded", "false");
  });
});

describe("WI-174: Open all and Close all (D4)", () => {
  it("with two or more projects they open and close every project's row, and leave Company Holidays alone", async () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();

    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    await act(async () => {});
    for (const name of [OSSORY, TAMBER, WRASSE]) expect(row(name)).toHaveAttribute("aria-expanded", "true");
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "false");
    expect(nager.fetchAvailableCountries).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: "Close all" }));
    for (const name of [OSSORY, TAMBER, WRASSE]) expect(row(name)).toHaveAttribute("aria-expanded", "false");
  });

  it("they sit outside the section's heading, whose name stays its own words", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    expect(screen.getByRole("heading", { level: 2, name: "Project-Specific Non-Work Days" })).toBeInTheDocument();
  });

  it("with one project there is neither", () => {
    useProjectStore.setState({ projects: [project(OSSORY)] });
    renderAt();
    expect(screen.queryByRole("button", { name: "Open all" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close all" })).toBeNull();
  });
});

describe("WI-174: what each row says beside its name", () => {
  it("a project's row reads its name, a comma, and its parts with a comma between them (ruling 7)", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    expect(screen.getByRole("button", { name: `${OSSORY}, 1 holiday, 2 converted work days` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${TAMBER}, No changes` })).toBeInTheDocument();
  });

  it("the visible · between two parts is hidden from screen readers", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    const dot = within(row(OSSORY)).getByText("·", { normalizer: (s) => s.trim() });
    expect(dot).toHaveAttribute("aria-hidden", "true");
    // On screen the · stands between the two parts.
    const text = row(OSSORY).textContent!;
    expect(text.indexOf("1 holiday")).toBeLessThan(text.indexOf("·"));
    expect(text.indexOf("·")).toBeLessThan(text.indexOf("2 converted work days"));
  });

  it("a converted work day a company holiday falls on is counted apart, as its chip is struck through (ruling 5)", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    expect(screen.getByRole("button", { name: `${WRASSE}, 2 converted work days, 1 not in effect` })).toBeInTheDocument();

    fireEvent.click(row(WRASSE));
    const body = bodyOf(row(WRASSE));
    const chips = within(body).getAllByRole("button", { name: /^Remove \d/ });
    const notInEffect = chips.filter((b) => b.parentElement?.getAttribute("title")?.startsWith("Not currently a work day"));
    expect(chips).toHaveLength(2);
    expect(notInEffect).toHaveLength(1);
  });

  it("Company Holidays names its count and the last date covered, in the user's Date Format (ruling 10)", () => {
    usePreferencesStore.setState({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        dateFormat: "DD/MM/YYYY",
        globalCalendar: { holidays: [WINTER_SHUTDOWN, THANKSGIVING] },
      },
    });
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    expect(screen.getByRole("button", { name: "Company Holidays, 2 holidays, through 31/12/2026" })).toBeInTheDocument();
  });

  it("Company Holidays with none reads No holidays", () => {
    setCompanyHolidays([]);
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    expect(screen.getByRole("button", { name: "Company Holidays, No holidays" })).toBeInTheDocument();
  });

  it("the paragraph under Company Holidays no longer points at a list below it (ruling 10)", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    expect(
      screen.getByText(
        "Holidays configured here apply to all projects. Work days are Mon, Tue, Wed, Thu, Fri, excluding company holidays.",
      ),
    ).toBeVisible();
  });

  it("an open project's Converted Work Days heading sits BELOW its name in the outline: an h4 (ruling 6)", () => {
    useProjectStore.setState({ projects: threeProjects() });
    renderAt();
    fireEvent.click(row(TAMBER));
    expect(screen.getByRole("heading", { level: 4, name: "Converted Work Days" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Converted Work Days" })).toBeNull();
  });
});

describe("WI-174: Company Holidays starts open only when the project list is KNOWN to be empty (ruling 1)", () => {
  it("local storage with no projects: open, as the only thing on the page", () => {
    renderAt();
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "true");
    expect(holidayNameInputs()).toHaveLength(1);
  });

  it("only archived projects: open, since the page lists none", () => {
    useProjectStore.setState({ projects: [project(OSSORY, { archived: true })] });
    renderAt();
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "true");
  });

  it("while a cloud first load is pending it stays closed and mounts nothing, and opens when the load ends empty", () => {
    startCloudFirstLoad();
    renderAt();
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "false");
    expect(holidayNameInputs()).toHaveLength(0);

    endCloudFirstLoad([]);
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "true");
  });

  it("while a cloud first load is pending it stays closed, and stays closed when projects arrive: no flip", () => {
    startCloudFirstLoad();
    renderAt();
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "false");
    endCloudFirstLoad(threeProjects());
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "false");
    expect(holidayNameInputs()).toHaveLength(0);
  });

  it("while a remembered cloud sign-in is being restored (storage not ready) it stays closed", () => {
    storage.storageReady = false;
    renderAt();
    expect(row("Company Holidays")).toHaveAttribute("aria-expanded", "false");
  });
});

describe("WI-174: a project's link opens its row (D6)", () => {
  it("?project=<id> opens that row, scrolls it into view and gives its button focus; the others stay closed", () => {
    const projects = threeProjects();
    useProjectStore.setState({ projects });
    const before = scrollIntoViewCallLog().length;
    renderAt(`/calendar?project=${projects[2]!.id}`);

    expect(row(WRASSE)).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(row(WRASSE));
    const calls = scrollIntoViewCallLog().slice(before);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.element).toBe(row(WRASSE));
    expect(calls[0]!.options).toEqual({ block: "start" });
    for (const name of ["Company Holidays", OSSORY, TAMBER]) expect(row(name)).toHaveAttribute("aria-expanded", "false");
  });

  it("the linked row's button keeps its 80 px scroll margin (scroll-mt-20, ruling 2)", () => {
    const projects = threeProjects();
    useProjectStore.setState({ projects });
    renderAt(`/calendar?project=${projects[0]!.id}`);
    expect(row(OSSORY)).toHaveClass("scroll-mt-20");
  });

  it("it scrolls and focuses once per arrival: a later change to the list neither scrolls again nor takes focus", () => {
    const projects = threeProjects();
    useProjectStore.setState({ projects });
    const before = scrollIntoViewCallLog().length;
    renderAt(`/calendar?project=${projects[1]!.id}`);
    expect(scrollIntoViewCallLog().slice(before)).toHaveLength(1);
    // Nothing has focus again, so only "once per arrival" can keep the next render from scrolling.
    act(() => row(TAMBER).blur());
    expect(document.activeElement).toBe(document.body);

    act(() => useProjectStore.getState().renameProject(projects[0]!.id, "Ossory Causeway North"));
    expect(screen.getByRole("button", { name: /^Ossory Causeway North,/ })).toBeInTheDocument();
    expect(scrollIntoViewCallLog().slice(before)).toHaveLength(1);
    expect(document.activeElement).toBe(document.body);
  });

  it("a project that arrives after the page mounts — a cloud first load — still opens, scrolls and takes focus", () => {
    const projects = threeProjects();
    startCloudFirstLoad();
    const before = scrollIntoViewCallLog().length;
    renderAt(`/calendar?project=${projects[1]!.id}`);
    expect(scrollIntoViewCallLog().slice(before)).toHaveLength(0);

    endCloudFirstLoad(projects);
    expect(row(TAMBER)).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(row(TAMBER));
    expect(scrollIntoViewCallLog().slice(before).map((c) => c.element)).toEqual([row(TAMBER)]);
  });

  it("while the user is already at work on the page, the arrival opens the row but leaves focus and scroll alone (ruling 3)", () => {
    const projects = threeProjects();
    startCloudFirstLoad();
    const before = scrollIntoViewCallLog().length;
    renderAt(`/calendar?project=${projects[1]!.id}`);

    fireEvent.click(row("Company Holidays"));
    const input = within(bodyOf(row("Company Holidays"))).getByLabelText("Holiday Name");
    act(() => input.focus());

    endCloudFirstLoad(projects);
    expect(row(TAMBER)).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(input);
    expect(scrollIntoViewCallLog().slice(before)).toHaveLength(0);
  });

  it("an unknown id opens nothing, scrolls nothing and moves no focus", () => {
    useProjectStore.setState({ projects: threeProjects() });
    const before = scrollIntoViewCallLog().length;
    renderAt("/calendar?project=no-such-project");
    for (const name of ["Company Holidays", OSSORY, TAMBER, WRASSE]) expect(row(name)).toHaveAttribute("aria-expanded", "false");
    expect(scrollIntoViewCallLog().slice(before)).toHaveLength(0);
    expect(document.activeElement).toBe(document.body);
  });

  it("an archived project's id opens nothing: the page does not list it", () => {
    const archived = project("Quillon Viaduct", { archived: true });
    useProjectStore.setState({ projects: [...threeProjects(), archived] });
    const before = scrollIntoViewCallLog().length;
    renderAt(`/calendar?project=${archived.id}`);
    expect(screen.queryByRole("button", { name: /^Quillon Viaduct,/ })).toBeNull();
    for (const name of ["Company Holidays", OSSORY, TAMBER, WRASSE]) expect(row(name)).toHaveAttribute("aria-expanded", "false");
    expect(scrollIntoViewCallLog().slice(before)).toHaveLength(0);
  });
});
