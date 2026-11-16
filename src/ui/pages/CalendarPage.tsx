// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef, useState, type Ref } from "react";
import { useSearchParams } from "react-router-dom";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { useStorage } from "@ui/providers/StorageProvider";
import { CalendarEditor } from "@ui/components/CalendarEditor";
import { CalendarRow } from "@ui/components/CalendarRow";
import { isCloudCreateBlocked } from "@ui/hooks/use-cloud-create-blocked";
import { WorkDayOverrideEditor } from "@ui/components/WorkDayOverrideEditor";
import { WEEKDAY_LABELS, type Project } from "@domain/models/types";
import {
  companyCalendarSummary,
  notInEffectCount,
  overrideChipDates,
  projectCalendarSummary,
} from "@ui/helpers/calendar-summary";

const COMPANY_ROW = "company";

interface ProjectCalendarRowProps {
  project: Project;
  open: boolean;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * One project's calendar as a row. Its summary counts the chips not in effect with the project's own work
 * calendar and holidays, as `WorkDayOverrideEditor` does, so the words and the chips cannot disagree (ruling 5).
 */
function ProjectCalendarRow({ project, open, onToggle, buttonRef }: ProjectCalendarRowProps) {
  const workCalendar = useWorkCalendar(project.id);
  const projectHolidays = project.globalCalendarOverride?.holidays ?? [];
  const chipDates = overrideChipDates(project.convertedWorkDays ?? [], project.forcedWorkDays ?? []);
  const summary = projectCalendarSummary(
    projectHolidays.length,
    chipDates.length,
    notInEffectCount(chipDates, { projectHolidays, workCalendar }),
  );
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <CalendarRow
        level={3}
        name={project.name}
        summary={summary}
        open={open}
        onToggle={onToggle}
        buttonRef={buttonRef}
        headingClassName="font-semibold text-gray-900 dark:text-gray-100"
        bodyClassName="mt-3"
      >
        <CalendarEditor
          calendar={
            project.globalCalendarOverride ?? { holidays: [] }
          }
          onUpdate={(calendar) => {
            useProjectStore
              .getState()
              .setProjectCalendar(project.id, calendar);
          }}
        />
        <WorkDayOverrideEditor
          projectId={project.id}
          convertedWorkDays={project.convertedWorkDays ?? []}
          forcedWorkDays={project.forcedWorkDays ?? []}
          projectCalendarOverride={project.globalCalendarOverride}
        />
      </CalendarRow>
    </div>
  );
}

/**
 * WI-174 (v0.87.0): every calendar is one line, closed on every visit, with what it holds beside its name. A
 * row's open state is DERIVED — the user's own toggle if there is one, otherwise its default — so a project
 * linked by `?project=<id>` opens even when it arrives after the page mounts (a cloud first load), and nothing
 * is set in an effect.
 */
export function CalendarPage() {
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const cloudDataLoaded = useProjectStore((s) => s.cloudDataLoaded);
  const { mode, storageReady } = useStorage();
  const globalCalendar = usePreferencesStore((s) => s.preferences.globalCalendar) ?? { holidays: [] };
  const workDays = usePreferencesStore((s) => s.preferences.workDays) ?? [1, 2, 3, 4, 5];
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);
  const formatDate = useDateFormat();
  const [searchParams] = useSearchParams();
  const linkedId = searchParams.get("project");
  // The user's own open/close per row; a row without one takes its default (D3, D6).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const linkedButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // WI-113: not while a cloud session's first load runs (owner ruling, 2026-10-16).
    if (projects.length === 0 && !isCloudCreateBlocked()) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);
  const workDayNames = workDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(", ");

  const unarchived = projects.filter((p) => !p.archived);
  const linkedPresent = linkedId !== null && unarchived.some((p) => p.id === linkedId);

  // D6: once per arrival of the linked project, bring its row into view and give its button focus — but only
  // while nothing has focus, so a user already at work on the page keeps their place (ruling 3). The button's
  // `scroll-mt-20` lands it below the sticky header (ruling 2). No state is set.
  useEffect(() => {
    if (!linkedPresent) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    linkedButtonRef.current?.scrollIntoView({ block: "start" });
    linkedButtonRef.current?.focus({ preventScroll: true });
  }, [linkedId, linkedPresent]);

  const isOpen = (row: string, byDefault: boolean) => toggled[row] ?? byDefault;
  const toggle = (row: string, byDefault: boolean) =>
    setToggled((t) => ({ ...t, [row]: !(t[row] ?? byDefault) }));
  const setAllProjects = (open: boolean) =>
    setToggled((t) => ({ ...t, ...Object.fromEntries(unarchived.map((p) => [p.id, open])) }));
  // D3's exception: Company Holidays starts open only when the project list is KNOWN to be empty (ruling 1). While a
  // load is pending — the Dashboard's and a project page's own expression — an empty list is not "no projects".
  const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);
  const companyByDefault = unarchived.length === 0 && !cloudLoadPending;

  return (
    <div className="space-y-8">
      {/* The page titles itself by its nav label, as Projects, Settings and About do;
          "Company Holidays" is the first of its two sections. */}
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Calendar</h1>

      {/* Section 1: Company-wide holidays */}
      <section>
        <CalendarRow
          level={2}
          name="Company Holidays"
          summary={companyCalendarSummary(globalCalendar.holidays, formatDate)}
          open={isOpen(COMPANY_ROW, companyByDefault)}
          onToggle={() => toggle(COMPANY_ROW, companyByDefault)}
          headingClassName="text-xl font-bold text-gray-900 dark:text-gray-100"
          intro={
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Holidays configured here apply to all projects. Work days are{" "}
              {workDayNames}, excluding company holidays.
            </p>
          }
          bodyClassName="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
        >
          <CalendarEditor
            calendar={globalCalendar}
            onUpdate={(calendar) => updatePreferences({ globalCalendar: calendar })}
          />
        </CalendarRow>
      </section>

      {/* Section 2: Per-project holidays + converted work days */}
      {unarchived.length > 0 && (
        <section>
          {/* Open all and Close all sit OUTSIDE the h2, so the heading's name stays its own words (D4). */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Project-Specific Non-Work Days
            </h2>
            {unarchived.length >= 2 && (
              <div className="flex gap-3 text-sm">
                <button type="button" onClick={() => setAllProjects(true)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                  Open all
                </button>
                <button type="button" onClick={() => setAllProjects(false)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                  Close all
                </button>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Add holidays that apply only to a specific project (e.g., team
            offsite, vendor shutdown). You can also convert specific non-work
            days — including company holidays — into work days per project.
          </p>
          <div className="mt-4 space-y-3">
            {unarchived.map((project) => {
              const byDefault = project.id === linkedId;
              return (
                <ProjectCalendarRow
                  key={project.id}
                  project={project}
                  open={isOpen(project.id, byDefault)}
                  onToggle={() => toggle(project.id, byDefault)}
                  buttonRef={byDefault ? linkedButtonRef : undefined}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
