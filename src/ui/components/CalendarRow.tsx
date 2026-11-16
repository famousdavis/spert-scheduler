// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Fragment, useId, useState, type ReactNode, type Ref } from "react";

interface CalendarRowProps {
  level: 2 | 3;
  name: string;
  /** The summary's parts, shown joined by "·" and spoken with a comma between them. */
  summary: readonly string[];
  open: boolean;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  headingClassName: string;
  /** Shown under the heading whether the row is open or closed. */
  intro?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * WI-174 (v0.87.0): one calendar on the Calendar page as a disclosure — a button inside the heading, showing the
 * calendar's name and what it holds, and its body below. The body mounts the first time the row opens and is
 * then only hidden, so anything typed in it, or a confirmation waiting in it, survives a close (D5).
 */
export function CalendarRow({
  level,
  name,
  summary,
  open,
  onToggle,
  buttonRef,
  headingClassName,
  intro,
  bodyClassName,
  children,
}: CalendarRowProps) {
  const bodyId = useId();
  // What a screen reader says: the name, then each part, with a comma between them (owner, ruling 7) — "Cloud ERP
  // Solution, 1 holiday, 2 converted work days". ⚠️ A label, not hidden commas in the text: Chrome 154 sets an
  // `sr-only` box apart by spaces when it builds a name ("Cloud ERP Solution , 1 holiday , …"), and a comma at a
  // 0 px font size, which Chrome reads exactly, is the arbitrary pixel size the legibility floor forbids.
  const spokenName = [name, ...summary].join(", ");
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <>
      <Heading className={headingClassName}>
        <button
          type="button"
          ref={buttonRef}
          aria-label={spokenName}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex w-full flex-wrap items-baseline gap-x-2 text-left scroll-mt-20 rounded focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={open ? "h-4 w-4 shrink-0 self-center rotate-90 transition-transform" : "h-4 w-4 shrink-0 self-center transition-transform"}
          >
            <path d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" />
          </svg>
          <span className="min-w-0 break-words">{name}</span>{" "}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            {summary.map((part, i) => (
              <Fragment key={part}>
                {/* The · is for the eye; the label above speaks a comma in its place. */}
                {i > 0 && (
                  <>
                    {" "}
                    <span aria-hidden="true">·</span>{" "}
                  </>
                )}
                {part}
              </Fragment>
            ))}
          </span>
        </button>
      </Heading>
      {intro}
      <div id={bodyId} hidden={!open} className={bodyClassName}>
        {mounted && children}
      </div>
    </>
  );
}
