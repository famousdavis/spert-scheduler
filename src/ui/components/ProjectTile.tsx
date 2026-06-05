// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "@domain/models/types";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { formatDateISO } from "@core/calendar/calendar";
import { hexToTintedBackground } from "@ui/helpers/color-utils";
import { TileColorPicker } from "./TileColorPicker";
import { ConfirmDialog } from "./ConfirmDialog";

/** Alpha for the full-tile color wash. Tuned to read over both the white card
 *  (light) and the gray-800 card (dark) without overwhelming the contents. */
const TILE_TINT_ALPHA = 0.12;

interface ProjectTileProps {
  project: Project;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  onClone?: (id: string) => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onChangeTileColor?: (id: string, color: string | undefined) => void;
  onShare?: () => void;
}

function projectTileBorderClass(isDragging: boolean, archived: boolean): string {
  if (isDragging) return "border-blue-400 shadow-lg opacity-80 z-10";
  if (archived) return "border-gray-300 dark:border-gray-600 opacity-60 hover:opacity-100";
  return "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 shadow-sm hover:shadow-md";
}

// Shared resting style for hover-revealed icon buttons.
const ICON_BTN = "p-1 text-gray-300 dark:text-gray-600 transition-colors";
// Reveal on tile hover or when any child has keyboard focus.
const REVEAL =
  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity";

export function ProjectTile({
  project,
  onNavigate,
  onDelete,
  onClone,
  onArchive,
  onUnarchive,
  onChangeTileColor,
  onShare,
}: ProjectTileProps) {
  const formatDate = useDateFormat();
  // Whole tile is the drag surface: spread {...listeners} on the root. Omit
  // {...attributes} so the root isn't announced as a "sortable" role=button
  // (mouse-only drag; keyboard-open is provided by the name button below).
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  // Defensive post-drag click suppression. Scoped per ProjectTile instance, so
  // dragging this tile can never suppress a click on a different tile. Cheap;
  // remove if a preview confirms dnd-kit already swallows the trailing click.
  const suppressClickRef = useRef(false);
  useEffect(() => {
    if (isDragging) {
      suppressClickRef.current = true;
    } else if (suppressClickRef.current) {
      const t = setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
      return () => clearTimeout(t);
    }
  }, [isDragging]);

  const tint = project.tileColor
    ? hexToTintedBackground(project.tileColor, TILE_TINT_ALPHA)
    : null;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(project.tileColor
      ? { borderLeftColor: project.tileColor, borderLeftWidth: "4px" }
      : {}),
    ...(tint ? { backgroundImage: `linear-gradient(${tint}, ${tint})` } : {}),
  };

  const open = () => {
    if (isDragging || suppressClickRef.current) return;
    onNavigate(project.id);
  };

  const stopDown = (e: React.PointerEvent) => e.stopPropagation();

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive?.(project.id);
  };
  const handleUnarchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUnarchive?.(project.id);
  };
  const handleClone = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClone?.(project.id);
  };
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare?.();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      onClick={open}
      className={`group relative bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer transition-all ${projectTileBorderClass(
        isDragging,
        project.archived ?? false
      )}`}
    >
      {/* Content (pb-8 reserves space for the bottom corner clusters) */}
      <div className="pb-8">
        {/* Name row — pr-9 reserves space for the top-right trash on this row only */}
        <div className="flex items-center gap-2 pr-9">
          <h2 className="min-w-0 flex-1 font-semibold text-gray-900 dark:text-gray-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              className="block max-w-full truncate text-left hover:underline focus:outline-none focus:underline"
            >
              {project.name}
            </button>
          </h2>
          {project.archived && (
            <span className="shrink-0 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
              Archived
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {project.scenarios.length} scenario
          {project.scenarios.length !== 1 ? "s" : ""}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Created {formatDate(formatDateISO(new Date(project.createdAt)))}
        </p>
      </div>

      {/* Trash — always visible, top-right, routed through ConfirmDialog */}
      <ConfirmDialog
        trigger={
          <button
            type="button"
            onPointerDown={stopDown}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-3 right-3 p-1 text-gray-500 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Delete project"
            aria-label="Delete project"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
            </svg>
          </button>
        }
        title="Delete project?"
        description={project.name}
        confirmLabel="Delete"
        destructive
        onConfirm={() => onDelete(project.id)}
      />

      {/* Share — hover/focus, bottom-left (cloud-mode owned projects only) */}
      {onShare && (
        <button
          type="button"
          onClick={handleShare}
          onPointerDown={stopDown}
          className={`absolute bottom-3 left-3 ${ICON_BTN} hover:text-blue-500 dark:hover:text-blue-400 ${REVEAL}`}
          title="Share project"
          aria-label="Share project"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </button>
      )}

      {/* Bottom-right cluster — hover/focus: archive, clone, color picker */}
      <div
        className={`absolute bottom-3 right-3 flex items-center gap-1 ${REVEAL}`}
      >
        {project.archived
          ? onUnarchive && (
              <button
                type="button"
                onClick={handleUnarchive}
                onPointerDown={stopDown}
                className={`${ICON_BTN} hover:text-blue-500 dark:hover:text-blue-400`}
                title="Unarchive project"
                aria-label="Unarchive project"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 4h12v1H2V4zm1 2h10v8H3V6zm3 2v4h4V8H6z" />
                </svg>
              </button>
            )
          : onArchive && (
              <button
                type="button"
                onClick={handleArchive}
                onPointerDown={stopDown}
                className={`${ICON_BTN} hover:text-amber-500 dark:hover:text-amber-400`}
                title="Archive project"
                aria-label="Archive project"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 4h12v1H2V4zm1 2h10v8H3V6zm3 2v4h4V8H6z" />
                </svg>
              </button>
            )}
        {onClone && (
          <button
            type="button"
            onClick={handleClone}
            onPointerDown={stopDown}
            className={`${ICON_BTN} hover:text-blue-500 dark:hover:text-blue-400`}
            title="Clone project"
            aria-label="Clone project"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="5" y="5" width="8" height="8" rx="1" />
              <path d="M3 11V4a1 1 0 0 1 1-1h7" />
            </svg>
          </button>
        )}
        {onChangeTileColor && (
          <TileColorPicker
            value={project.tileColor}
            onChange={(c) => onChangeTileColor(project.id, c)}
          />
        )}
      </div>
    </div>
  );
}
