import { useState, useRef, useEffect } from "react";
import type { RSMLevel } from "@domain/models/types";
import { RSM_LEVELS, RSM_LABELS, RSM_DESCRIPTIONS } from "@domain/models/types";

interface ConfidenceLevelSelectProps {
  value: RSMLevel;
  onChange: (level: RSMLevel) => void;
}

export function ConfidenceLevelSelect({
  value,
  onChange,
}: ConfidenceLevelSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 rounded text-sm text-left focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 dark:text-gray-100 truncate"
        tabIndex={-1}
      >
        {RSM_LABELS[value]}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto right-0">
          {RSM_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => {
                onChange(level);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                level === value ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "dark:text-gray-100"
              }`}
            >
              <p className="text-sm font-medium">{RSM_LABELS[level]}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {RSM_DESCRIPTIONS[level]}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
