// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState } from "react";
import {
  HEURISTIC_DOMAINS,
  getSubdomains,
  getHeuristic,
} from "@domain/data/estimation-heuristics";

interface HeuristicSuggesterProps {
  onApply: (minPct: number, maxPct: number) => void;
}

export default function HeuristicSuggester({ onApply }: HeuristicSuggesterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedSubdomain, setSelectedSubdomain] = useState<string | null>(null);

  const subdomains = selectedDomain ? getSubdomains(selectedDomain) : [];
  const heuristic =
    selectedDomain && selectedSubdomain
      ? getHeuristic(selectedDomain, selectedSubdomain)
      : undefined;

  function closePanel() {
    setIsOpen(false);
    setSelectedDomain(null);
    setSelectedSubdomain(null);
  }

  function handleApply() {
    if (heuristic) {
      onApply(heuristic.minPct, heuristic.maxPct);
      closePanel();
    }
  }

  function handleDomainChange(value: string) {
    if (value === "") {
      setSelectedDomain(null);
      setSelectedSubdomain(null);
    } else {
      setSelectedDomain(value);
      setSelectedSubdomain(null);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
      >
        Suggest defaults for my project type
      </button>
    );
  }

  const selectClasses =
    "px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none";

  return (
    <div className="w-full mt-2 p-3 border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Estimation Heuristic Suggester
        </span>
        <button
          type="button"
          onClick={closePanel}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Domain dropdown */}
        <select
          value={selectedDomain ?? ""}
          onChange={(e) => handleDomainChange(e.target.value)}
          className={selectClasses}
        >
          <option value="">Select domain…</option>
          {HEURISTIC_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Subdomain dropdown */}
        <select
          value={selectedSubdomain ?? ""}
          onChange={(e) =>
            setSelectedSubdomain(e.target.value === "" ? null : e.target.value)
          }
          disabled={!selectedDomain}
          className={`${selectClasses} ${!selectedDomain ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <option value="">Select subdomain…</option>
          {subdomains.map((h) => (
            <option key={h.subdomain} value={h.subdomain}>
              {h.subdomain}
            </option>
          ))}
        </select>
      </div>

      {/* Suggestion card */}
      {heuristic && (
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="flex items-center gap-4 text-sm text-gray-900 dark:text-gray-100">
            <span>
              Optimistic: <strong>{heuristic.minPct}%</strong> of most likely
            </span>
            <span>
              Pessimistic: <strong>{heuristic.maxPct}%</strong> of most likely
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
            {heuristic.rationale}
          </p>
          <button
            type="button"
            onClick={handleApply}
            className="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
          >
            Apply these values
          </button>
        </div>
      )}
    </div>
  );
}
