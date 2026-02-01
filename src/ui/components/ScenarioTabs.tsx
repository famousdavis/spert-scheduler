import type { Scenario } from "@domain/models/types";

interface ScenarioTabsProps {
  scenarios: Scenario[];
  activeScenarioId: string | null;
  onSelect: (scenarioId: string) => void;
  onAdd: () => void;
  onClone: (scenarioId: string) => void;
  onDelete: (scenarioId: string) => void;
}

export function ScenarioTabs({
  scenarios,
  activeScenarioId,
  onSelect,
  onAdd,
  onClone,
  onDelete,
}: ScenarioTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
      {scenarios.map((scenario) => {
        const isActive = scenario.id === activeScenarioId;
        return (
          <div
            key={scenario.id}
            className={`group flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer border-b-2 transition-colors ${
              isActive
                ? "border-blue-500 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            onClick={() => onSelect(scenario.id)}
          >
            <span>{scenario.name}</span>
            <div className="hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClone(scenario.id);
                }}
                className="text-gray-400 hover:text-blue-500 text-xs"
                title="Clone scenario"
              >
                &#x2398;
              </button>
              {scenarios.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(scenario.id);
                  }}
                  className="text-gray-400 hover:text-red-500 text-xs"
                  title="Delete scenario"
                >
                  &#10005;
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="px-3 py-2 text-sm text-gray-400 hover:text-blue-600 transition-colors"
        title="Add scenario"
      >
        +
      </button>
    </div>
  );
}
