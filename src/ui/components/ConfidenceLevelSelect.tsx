import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  // Calculate dropdown position when opening
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 288; // max-h-72 = 18rem = 288px
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Open upward if not enough space below and more space above
    const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setPosition({
      top: openUp ? rect.top - dropdownHeight : rect.bottom + 4,
      left: rect.right - 256, // 256px = w-64
      openUp,
    });
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  // Close on scroll outside dropdown (dropdown position would be stale)
  useEffect(() => {
    if (!open) return;
    const handleScroll = (e: Event) => {
      // Don't close if scrolling inside the dropdown
      if (dropdownRef.current?.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 rounded text-sm text-left focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 dark:text-gray-100 truncate"
        tabIndex={-1}
      >
        {RSM_LABELS[value]}
      </button>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
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
          </div>,
          document.body
        )}
    </div>
  );
}
