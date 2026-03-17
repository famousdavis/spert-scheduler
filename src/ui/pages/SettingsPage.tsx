// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect } from "react";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { ExportSection } from "@ui/components/ExportSection";
import { ImportSection } from "@ui/components/ImportSection";
import { PreferencesSection } from "@ui/components/PreferencesSection";
import { LocalStorageSection } from "@ui/components/LocalStorageSection";
import { StorageModeSection } from "@ui/components/StorageModeSection";
import { ScheduleExportSection } from "@ui/components/ScheduleExportSection";

export function SettingsPage() {
  const { projects, loadProjects, importProjects } = useProjectStore();
  const { loadPreferences: loadPrefs } = usePreferencesStore();

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
    loadPrefs();
  }, [projects.length, loadProjects, loadPrefs]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
      <PreferencesSection />
      <LocalStorageSection />
      <StorageModeSection />
      <ExportSection projects={projects} />
      <ScheduleExportSection projects={projects} />
      <ImportSection projects={projects} importProjects={importProjects} />
    </div>
  );
}
