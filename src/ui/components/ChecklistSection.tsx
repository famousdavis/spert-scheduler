// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useRef, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistItem } from "@domain/models/types";
import { generateId } from "@app/api/id";

const MAX_CHECKLIST_ITEMS = 20;

/** Sortable checklist item row */
function SortableChecklistRow({
  item,
  onToggle,
  onTextChange,
  onRemove,
}: {
  item: ChecklistItem;
  onToggle: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 group"
    >
      <button
        type="button"
        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab shrink-0 touch-none"
        {...attributes}
        {...listeners}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>
      <input
        type="checkbox"
        checked={item.completed}
        onChange={() => onToggle(item.id)}
        className="shrink-0 rounded border-gray-300 dark:border-gray-600 text-blue-600"
      />
      <input
        type="text"
        value={item.text}
        onChange={(e) => onTextChange(item.id, e.target.value)}
        maxLength={200}
        className={`flex-1 min-w-0 text-sm border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-400 rounded px-1.5 py-0.5 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none ${
          item.completed ? "line-through text-gray-400 dark:text-gray-500" : ""
        }`}
      />
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove task"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface ChecklistSectionProps {
  checklist: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export function ChecklistSection({ checklist, onChange }: ChecklistSectionProps) {
  const [newTaskText, setNewTaskText] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleAddTask = useCallback(() => {
    const text = newTaskText.trim();
    if (!text) return;
    // Guard against max items using current prop value (avoids stale closure)
    if (checklist.length >= MAX_CHECKLIST_ITEMS) return;
    onChange([...checklist, { id: generateId(), text, completed: false }]);
    setNewTaskText("");
    requestAnimationFrame(() => newTaskInputRef.current?.focus());
  }, [newTaskText, checklist, onChange]);

  const handleToggleTask = useCallback((id: string) => {
    onChange(
      checklist.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  }, [checklist, onChange]);

  const handleTaskTextChange = useCallback((id: string, text: string) => {
    onChange(
      checklist.map((item) => (item.id === id ? { ...item, text } : item))
    );
  }, [checklist, onChange]);

  const handleRemoveTask = useCallback((id: string) => {
    onChange(checklist.filter((item) => item.id !== id));
  }, [checklist, onChange]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = checklist.findIndex((item) => item.id === active.id);
    const newIndex = checklist.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...checklist];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved!);
    onChange(next);
  }, [checklist, onChange]);

  const doneCount = useMemo(
    () => checklist.filter((item) => item.completed).length,
    [checklist]
  );

  return (
    <>
      {checklist.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No tasks added.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={checklist.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {checklist.map((item) => (
                <SortableChecklistRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggleTask}
                  onTextChange={handleTaskTextChange}
                  onRemove={handleRemoveTask}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add task input */}
      {checklist.length < MAX_CHECKLIST_ITEMS && (
        <div className="flex items-center gap-1.5 mt-2">
          <input
            ref={newTaskInputRef}
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(); } }}
            maxLength={200}
            placeholder="Add a task…"
            className="flex-1 min-w-0 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddTask}
            disabled={!newTaskText.trim()}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-40 shrink-0"
          >
            Add
          </button>
        </div>
      )}

      {checklist.length > 0 && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right mt-1">
          {doneCount}/{checklist.length} done · {checklist.length}/{MAX_CHECKLIST_ITEMS}
        </p>
      )}
    </>
  );
}
