// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Scenario } from "@domain/models/types";
import { InlineEdit } from "./InlineEdit";

interface ScenarioTabsProps {
  scenarios: Scenario[];
  activeScenarioId: string | null;
  onSelect: (scenarioId: string) => void;
  onAdd: () => void;
  onClone: (scenarioId: string) => void;
  onDelete: (scenarioId: string) => void;
  onRename?: (scenarioId: string, name: string) => void;
  onToggleLock?: (scenarioId: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  compareMode?: boolean;
  selectedForCompare?: Set<string>;
  onToggleCompare?: (scenarioId: string) => void;
}

function SortableScenarioTab({
  scenario,
  isActive,
  isBaseline,
  isEditing,
  scenarioCount,
  onSelect,
  onClone,
  onDelete,
  onRename,
  onToggleLock,
  onStartEditing,
  compareMode,
  selectedForCompare,
  onToggleCompare,
  activeRef,
}: {
  scenario: Scenario;
  isActive: boolean;
  isBaseline: boolean;
  isEditing: boolean;
  scenarioCount: number;
  onSelect: (scenarioId: string) => void;
  onClone: (scenarioId: string) => void;
  onDelete: (scenarioId: string) => void;
  onRename?: (scenarioId: string, name: string) => void;
  onToggleLock?: (scenarioId: string) => void;
  onStartEditing: (scenarioId: string) => void;
  compareMode?: boolean;
  selectedForCompare?: Set<string>;
  onToggleCompare?: (scenarioId: string) => void;
  activeRef?: (el: HTMLDivElement | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scenario.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isLocked = scenario.locked ?? false;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        if (isActive && activeRef) activeRef(el);
      }}
      style={style}
      className={`group flex items-center gap-1.5 px-3 py-2 text-sm cursor-pointer border-b-2 transition-colors shrink-0 ${
        isActive
          ? "border-blue-500 text-blue-700 dark:text-blue-400 font-medium"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
      onClick={() => {
        if (!isEditing) onSelect(scenario.id);
      }}
    >
      {/* Drag handle */}
      <button
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 -ml-1.5 mr-0.5"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor">
          <circle cx="3" cy="2" r="1" />
          <circle cx="7" cy="2" r="1" />
          <circle cx="3" cy="5" r="1" />
          <circle cx="7" cy="5" r="1" />
          <circle cx="3" cy="8" r="1" />
          <circle cx="7" cy="8" r="1" />
        </svg>
      </button>
      {compareMode && onToggleCompare && (
        <input
          type="checkbox"
          checked={selectedForCompare?.has(scenario.id) ?? false}
          onChange={(e) => {
            e.stopPropagation();
            onToggleCompare(scenario.id);
          }}
          className="rounded border-gray-300 dark:border-gray-600 mr-1"
        />
      )}
      {isEditing && onRename ? (
        <InlineEdit
          value={scenario.name}
          onSave={(name) => {
            onRename(scenario.id, name);
            onStartEditing(""); // clear editing
          }}
          className={isBaseline ? "font-semibold" : "font-medium"}
          inputClassName="text-sm font-medium w-32"
        />
      ) : (
        <span
          className={isBaseline ? "font-semibold" : "font-medium"}
          onDoubleClick={(e) => {
            if (onRename && !isLocked) {
              e.stopPropagation();
              onStartEditing(scenario.id);
            }
          }}
          title={isLocked ? "Locked scenario (click lock to edit)" : onRename ? "Double-click to rename" : undefined}
        >
          {scenario.name}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        {onToggleLock && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(scenario.id);
            }}
            className={`text-xs px-1 ${
              isLocked
                ? "text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                : "text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"
            }`}
            title={isLocked ? "Unlock scenario" : "Lock scenario"}
          >
            {isLocked ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0" />
              </svg>
            )}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClone(scenario.id);
          }}
          className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 text-xs"
          title="Clone scenario"
        >
          &#x2398;
        </button>
        {scenarioCount > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(scenario.id);
            }}
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-xs"
            title="Delete scenario"
          >
            &#10005;
          </button>
        )}
      </div>
    </div>
  );
}

export function ScenarioTabs({
  scenarios,
  activeScenarioId,
  onSelect,
  onAdd,
  onClone,
  onDelete,
  onRename,
  onToggleLock,
  onReorder,
  compareMode,
  selectedForCompare,
  onToggleCompare,
}: ScenarioTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const scenarioIds = useMemo(
    () => scenarios.map((s) => s.id),
    [scenarios]
  );

  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setActiveTab = useCallback((el: HTMLDivElement | null) => {
    activeTabRef.current = el;
  }, []);

  useEffect(() => {
    const el = activeTabRef.current;
    if (!el) return;
    el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [activeScenarioId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      el.scrollLeft += delta;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && onReorder) {
      const oldIndex = scenarios.findIndex((s) => s.id === active.id);
      const newIndex = scenarios.findIndex((s) => s.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(oldIndex, newIndex);
      }
    }
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden border-b border-gray-200 dark:border-gray-700 pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center gap-1 flex-nowrap w-max">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={scenarioIds}
            strategy={horizontalListSortingStrategy}
          >
            {scenarios.map((scenario, index) => (
              <SortableScenarioTab
                key={scenario.id}
                scenario={scenario}
                isActive={scenario.id === activeScenarioId}
                isBaseline={index === 0}
                isEditing={editingId === scenario.id}
                scenarioCount={scenarios.length}
                onSelect={onSelect}
                onClone={onClone}
                onDelete={onDelete}
                onRename={onRename}
                onToggleLock={onToggleLock}
                onStartEditing={setEditingId}
                compareMode={compareMode}
                selectedForCompare={selectedForCompare}
                onToggleCompare={onToggleCompare}
                activeRef={setActiveTab}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          onClick={onAdd}
          className="px-3 py-2 text-sm text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
          title="Add scenario"
        >
          +
        </button>
      </div>
    </div>
  );
}
