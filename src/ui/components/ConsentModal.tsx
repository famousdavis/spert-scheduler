// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { TOS_URL, PRIVACY_URL } from "@app/legal-constants";

interface ConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user accepts terms and clicks "Enable Cloud Storage". */
  onAccept: () => void;
}

export function ConsentModal({
  open,
  onOpenChange,
  onAccept,
}: ConsentModalProps) {
  const [checked, setChecked] = useState(false);

  // Reset checkbox each time modal opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setChecked(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Enable Cloud Storage
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Cloud Storage stores your project planning data in Firebase/Firestore
            on Google Cloud. Use is governed by the Statistical PERT® Terms of
            Service and Privacy Policy.
          </Dialog.Description>

          <div className="mt-4 flex gap-3 text-sm">
            <a
              href={TOS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
            >
              Terms of Service
            </a>
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
            >
              Privacy Policy
            </a>
          </div>

          <label className="mt-5 flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 text-blue-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              I have read and agree to the Terms of Service and Privacy Policy.
            </span>
          </label>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={!checked}
              onClick={onAccept}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Enable Cloud Storage
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
