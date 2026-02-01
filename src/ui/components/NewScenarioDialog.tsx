import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface ScenarioOption {
  id: string;
  name: string;
}

interface NewScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarios: ScenarioOption[];
  onCreate: (name: string, sourceScenarioId: string) => void;
}

export function NewScenarioDialog({
  open,
  onOpenChange,
  scenarios,
  onCreate,
}: NewScenarioDialogProps) {
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState(scenarios[0]?.id ?? "");

  // Reset source to Baseline (first scenario) whenever dialog opens
  useEffect(() => {
    if (open && scenarios.length > 0) {
      setSourceId(scenarios[0]!.id);
      setName("");
    }
  }, [open, scenarios]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && sourceId) {
      onCreate(name.trim(), sourceId);
      setName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <Dialog.Title className="text-lg font-semibold text-gray-900">
            Add Scenario
          </Dialog.Title>
          <p className="mt-1 text-sm text-gray-500">
            Clone from an existing scenario with a new name.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Copy from
              </label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scenario Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Optimistic timeline"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
