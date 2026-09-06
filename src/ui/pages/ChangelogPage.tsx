// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link } from "react-router-dom";
import { APP_VERSION } from "@app/constants";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { DateFormatPreference } from "@domain/models/types";
import { CHANGELOG } from "./changelog-data";

/**
 * Release dates keep a spelled-out month — INFORMED DECLINE of "changelog dates honour
 * the date-format preference" (audit M23; ruling R54, 2026-09-06). The preference exists
 * to remove day/month ambiguity, and a month name has none, so "September 6, 2026" →
 * "09/06/2026" would be a strict loss for the default reader and lateral for everyone
 * else. What the preference does decide here is the ORDER: a DD/MM/YYYY reader gets
 * "6 September 2026". (`document.title` in ProjectPage keeps en-US for a different
 * reason: that string becomes the Save-as-PDF filename, and slashes are not legal there.)
 */
function formatChangelogDate(dateStr: string, dateFormat: DateFormatPreference): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString(dateFormat === "DD/MM/YYYY" ? "en-GB" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ChangelogPage() {
  const dateFormat = usePreferencesStore((s) => s.preferences.dateFormat);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <Link
          to="/projects"
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          &larr; Back to Projects
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Changelog</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Current version: {APP_VERSION}
      </p>

      <div className="mt-8 space-y-10">
        {CHANGELOG.map((entry, i) => (
          <div
            key={entry.version}
            className={`pb-8 ${
              i < CHANGELOG.length - 1
                ? "border-b border-gray-200 dark:border-gray-700"
                : ""
            }`}
          >
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                v{entry.version}
              </h2>
              <span className="text-sm text-gray-400">
                {formatChangelogDate(entry.date, dateFormat)}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {entry.sections.map((section) => (
                <div key={section.title}>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {section.title}
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-6 text-sm text-gray-600 dark:text-gray-300">
                    {section.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
