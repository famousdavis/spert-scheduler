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
        className="w-full px-1 py-1 border border-gray-200 rounded text-sm text-left focus:border-blue-400 focus:outline-none bg-white truncate"
        tabIndex={-1}
      >
        {RSM_LABELS[value]}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto right-0">
          {RSM_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => {
                onChange(level);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${
                level === value ? "bg-blue-50 text-blue-700" : ""
              }`}
            >
              <p className="text-sm font-medium">{RSM_LABELS[level]}</p>
              <p className="text-xs text-gray-500">
                {RSM_DESCRIPTIONS[level]}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
