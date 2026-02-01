import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "@domain/models/types";

interface ProjectTileProps {
  project: Project;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectTile({
  project,
  onNavigate,
  onDelete,
}: ProjectTileProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg p-4 cursor-pointer transition-all ${
        isDragging
          ? "border-blue-400 shadow-lg opacity-80 z-10"
          : "border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-md"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">
            {project.name}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {project.scenarios.length} scenario
            {project.scenarios.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Created{" "}
            {new Date(project.createdAt).toLocaleDateString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          {/* Drag handle */}
          <button
            className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing p-1"
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
          {/* Delete button */}
          <button
            onClick={handleDelete}
            className="text-gray-300 hover:text-red-500 text-sm transition-colors p-1"
            title="Delete project"
          >
            &#10005;
          </button>
        </div>
      </div>
    </div>
  );
}
