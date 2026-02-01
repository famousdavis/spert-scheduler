import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface CloneScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  onClone: (newName: string, dropCompleted: boolean) => void;
}

export function CloneScenarioDialog({
  open,
  onOpenChange,
  sourceName,
  onClone,
}: CloneScenarioDialogProps) {
  const [name, setName] = useState(`${sourceName} (Copy)`);
  const [dropCompleted, setDropCompleted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onClone(name.trim(), dropCompleted);
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <Dialog.Title className="text-lg font-semibold text-gray-900">
            Clone Scenario
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 mt-1">
            Create a copy of &ldquo;{sourceName}&rdquo;
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dropCompleted}
                onChange={(e) => setDropCompleted(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">
                Drop completed activities (reforecast)
              </span>
            </label>
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
                Clone
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
