// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect, useCallback } from "react";
import { useBufferedField, type BufferedFieldControls } from "@ui/hooks/use-buffered-field";

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
  placeholder?: string;
  inputClassName?: string;
  name?: string;
  ariaLabel?: string;
}

/**
 * Inline editable text field. Renders as a clickable span; clicking enters
 * edit mode (auto-focus + select). Commits on blur, Enter, or click-away.
 * Reverts on Escape to the value at focus time (focus-time snapshot).
 *
 * Uses useBufferedField internally, guarding against cloud-sync echo
 * overwrites during focus.
 *
 * Enter path: keydown → inputRef.current?.blur() → handleBlur →
 * onCommit(localValue, controls) → handleCommit → onSave(trimmed) [or
 * controls.reset()] → setIsEditing(false). The explicit .blur() removes
 * reliance on React's synthetic-blur-on-conditional-unmount (version-
 * inconsistent). onSave runs synchronously to completion before
 * setIsEditing(false). If onSave triggers additional parent state updates,
 * React 18 auto-batching flushes them with setIsEditing(false) in a single
 * render — no intermediate state flash.
 *
 * Note on id={name}: `name` is used as the input's id. At most one
 * InlineEdit per `name` value may be rendered concurrently — enforced by
 * the parent's single editingId string (at most one scenario or project
 * rename is active at a time). Silent id collision otherwise.
 */
export function InlineEdit({
  value,
  onSave,
  className = "",
  placeholder = "Untitled",
  inputClassName = "",
  name = "inlineEdit",
  ariaLabel,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCommit = useCallback(
    (next: string, controls: BufferedFieldControls) => {
      const trimmed = next.trim();
      if (trimmed && trimmed !== value) {
        onSave(trimmed);
      } else {
        // Empty-after-trim or unchanged: reset buffer so the next focus
        // cycle shows the canonical value, not the user's rejected input.
        controls.reset();
      }
      setIsEditing(false);
    },
    [value, onSave],
  );

  const { localValue, setLocalValue, handleFocus, handleBlur, revertValue } = useBufferedField(
    value,
    handleCommit,
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        id={name}
        type="text"
        name={name}
        autoComplete="off"
        aria-label={ariaLabel ?? placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Explicit .blur() fires handleBlur → handleCommit; avoids relying on synthetic-blur-on-unmount.
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            // revertValue() arms suppressNextBlur; .blur() fires handleBlur which skips commit.
            // setIsEditing(false) is explicit because handleCommit does not run on the suppressed path.
            revertValue();
            inputRef.current?.blur();
            setIsEditing(false);
          }
        }}
        className={`border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 ${inputClassName}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 transition-colors ${className}`}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}
