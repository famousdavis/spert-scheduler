// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback } from "react";
import {
  serializeExport,
} from "@app/api/export-import-service";
import type { Project } from "@domain/models/types";
import { downloadFile } from "@ui/helpers/download";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { formatDateISO } from "@core/calendar/calendar";

interface ExportSectionProps {
  projects: Project[];
}

export function ExportSection({ projects }: ExportSectionProps) {
  const formatDate = useDateFormat();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeSimulationResults, setIncludeSimulationResults] = useState(false);

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleExport = useCallback(() => {
    const toExport = projects.filter((p) => selectedIds.has(p.id));
    if (toExport.length === 0) return;
    const json = serializeExport(toExport, { includeSimulationResults });
    const filename = `spert-export-${formatDateISO(new Date())}.json`;
    downloadFile(json, filename, "application/json");
  }, [projects, selectedIds, includeSimulationResults]);

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">Export Projects</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Download selected projects as a JSON file for backup or sharing.
      </p>

      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">No projects to export.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Select all toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={
                selectedIds.size === projects.length && projects.length > 0
              }
              onChange={toggleAll}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="font-medium">
              {selectedIds.size === projects.length
                ? "Deselect all"
                : "Select all"}
            </span>
          </label>

          {/* Project list */}
          <div className="border border-gray-100 dark:border-gray-700 rounded-md divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
            {projects.map((project) => (
              <label
                key={project.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(project.id)}
                  onChange={() => toggleProject(project.id)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                    {project.scenarios.length} scenario
                    {project.scenarios.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDate(project.createdAt.slice(0, 10))}
                </span>
              </label>
            ))}
          </div>

          {/* Include simulation results checkbox */}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeSimulationResults}
              onChange={(e) => setIncludeSimulationResults(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span>Include simulation results</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              (larger file)
            </span>
          </label>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </button>
        </div>
      )}
    </section>
  );
}
