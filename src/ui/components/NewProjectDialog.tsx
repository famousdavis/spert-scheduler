// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { NAME_MAX_LENGTH } from "@domain/models/types";
import { describedByWhile, CLOUD_CREATE_WAIT_NOTE } from "@ui/helpers/cloud-create-gate";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  /**
   * WI-112: true while the first cloud load runs. The Dashboard greys out its New Project then, but
   * a window opened before the load began is still open: its Create creates nothing, the window
   * stays open with the name, and a line in it says why.
   */
  blocked?: boolean;
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
  blocked = false,
}: NewProjectDialogProps) {
  const [name, setName] = useState("");
  const nameId = useId();
  const blockedId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && !blocked) {
      onCreate(name.trim());
      setName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            New Project
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor={nameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project Name
              </label>
              <input
                id={nameId}
                name="projectName"
                type="text"
                maxLength={NAME_MAX_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
                placeholder="My Project"
                autoFocus
              />
            </div>
            {blocked && (
              <p id={blockedId} role="note" className="text-sm text-amber-700 dark:text-amber-300">
                {CLOUD_CREATE_WAIT_NOTE}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!name.trim()}
                {...describedByWhile(blocked, blockedId)}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
