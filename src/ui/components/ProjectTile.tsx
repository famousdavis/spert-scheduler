import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "@domain/models/types";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { formatDateISO } from "@core/calendar/calendar";

interface ProjectTileProps {
  project: Project;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
}

export function ProjectTile({
  project,
  onNavigate,
  onDelete,
  onArchive,
  onUnarchive,
}: ProjectTileProps) {
  const formatDate = useDateFormat();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = () => {
    if (!isDragging) {
      onNavigate(project.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${project.name}"?`)) {
      onDelete(project.id);
    }
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive?.(project.id);
  };

  const handleUnarchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUnarchive?.(project.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer transition-all ${
        isDragging
          ? "border-blue-400 shadow-lg opacity-80 z-10"
          : project.archived
            ? "border-gray-300 dark:border-gray-600 opacity-60 hover:opacity-100"
            : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 shadow-sm hover:shadow-md"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {project.name}
            </h2>
            {project.archived && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                Archived
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {project.scenarios.length} scenario
            {project.scenarios.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Created{" "}
            {formatDate(formatDateISO(new Date(project.createdAt)))}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          {/* Drag handle */}
          <button
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing p-1"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <circle cx="5" cy="3" r="1.5" />
              <circle cx="11" cy="3" r="1.5" />
              <circle cx="5" cy="8" r="1.5" />
              <circle cx="11" cy="8" r="1.5" />
              <circle cx="5" cy="13" r="1.5" />
              <circle cx="11" cy="13" r="1.5" />
            </svg>
          </button>
          {/* Archive/Unarchive button */}
          {project.archived ? (
            onUnarchive && (
              <button
                onClick={handleUnarchive}
                className="text-gray-300 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400 text-sm transition-colors p-1"
                title="Unarchive project"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 4h12v1H2V4zm1 2h10v8H3V6zm3 2v4h4V8H6z" />
                </svg>
              </button>
            )
          ) : (
            onArchive && (
              <button
                onClick={handleArchive}
                className="text-gray-300 dark:text-gray-600 hover:text-amber-500 dark:hover:text-amber-400 text-sm transition-colors p-1"
                title="Archive project"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 4h12v1H2V4zm1 2h10v8H3V6zm3 2v4h4V8H6z" />
                </svg>
              </button>
            )
          )}
          {/* Delete button */}
          <button
            onClick={handleDelete}
            className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 text-sm transition-colors p-1"
            title="Delete project"
          >
            &#10005;
          </button>
        </div>
      </div>
    </div>
  );
}
