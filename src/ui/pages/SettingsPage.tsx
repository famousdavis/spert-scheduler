// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { ExportSection } from "@ui/components/ExportSection";
import { ImportSection } from "@ui/components/ImportSection";
import { ActivityImportSection } from "@ui/components/ActivityImportSection";
import { PreferencesSection } from "@ui/components/PreferencesSection";
import { LocalStorageSection } from "@ui/components/LocalStorageSection";
import { StorageModeSection } from "@ui/components/StorageModeSection";
import { ScheduleExportSection } from "@ui/components/ScheduleExportSection";
import { NotificationsSection } from "@ui/components/NotificationsSection";
import { useCloudCreateBlocked, isCloudCreateBlocked } from "@ui/hooks/use-cloud-create-blocked";
import { HeadingRow } from "@ui/components/HeadingRow";

export function SettingsPage() {
  const { projects, loadProjects, importProjects, importScenarioToProject } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      loadProjects: s.loadProjects,
      importProjects: s.importProjects,
      importScenarioToProject: s.importScenarioToProject,
    }))
  );
  const loadPrefs = usePreferencesStore((s) => s.loadPreferences);
  // WI-112: passed down, not read inside the section, so the section's own tests decide it.
  const createBlocked = useCloudCreateBlocked();

  useEffect(() => {
    // WI-113: not while a cloud session's first load runs (owner ruling, 2026-10-16).
    if (projects.length === 0 && !isCloudCreateBlocked()) {
      loadProjects();
    }
    loadPrefs();
  }, [projects.length, loadProjects, loadPrefs]);

  // The frame's heading row, then the body, both direct children of `main`: Settings is capped at 896 px (exception X4),
  // and the cap applies to every child of `main` but the heading row (FRAME26, v0.88.0).
  return (
    <>
    <HeadingRow>Settings</HeadingRow>
    <div className="sf-below space-y-8">
      <PreferencesSection />
      <LocalStorageSection />
      <NotificationsSection />
      <StorageModeSection />
      <ExportSection projects={projects} />
      <ScheduleExportSection projects={projects} />
      <ImportSection projects={projects} />
      <ActivityImportSection
        projects={projects}
        importProjects={importProjects}
        importScenarioToProject={importScenarioToProject}
        importBlocked={createBlocked}
      />
    </div>
    </>
  );
}
