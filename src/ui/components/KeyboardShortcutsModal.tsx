import * as Dialog from "@radix-ui/react-dialog";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { keys: ["Ctrl/Cmd", "Z"], description: "Undo last action" },
  { keys: ["Ctrl/Cmd", "Shift", "Z"], description: "Redo last action" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["Tab"], description: "Move to next field in activity grid" },
  { keys: ["Shift", "Tab"], description: "Move to previous field in activity grid" },
  { keys: ["Enter"], description: "Confirm cell edit" },
  { keys: ["Escape"], description: "Cancel cell edit" },
];

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key, i) => (
        <span key={i} className="flex items-center gap-1">
          <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300">
            {key}
          </kbd>
          {i < keys.length - 1 && (
            <span className="text-gray-400 dark:text-gray-500">+</span>
          )}
        </span>
      ))}
    </span>
  );
}

export function KeyboardShortcutsModal({
  open,
  onOpenChange,
}: KeyboardShortcutsModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Quick keyboard shortcuts for common actions.
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            {SHORTCUTS.map((shortcut, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <KeyCombo keys={shortcut.keys} />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {shortcut.description}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                Got it
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
