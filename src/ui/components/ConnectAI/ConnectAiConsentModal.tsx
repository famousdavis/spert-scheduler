// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useId } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AI_PRIVACY_URL } from "@app/ai-connectivity-constants";

interface ConnectAiConsentModalProps {
  open: boolean;
  onClose: () => void;
  /** Calls startSession; resolves true on success. Parent opens the panel. */
  onConnect: (consentRead: boolean) => Promise<boolean>;
  initialConsentRead?: boolean;
}

export function ConnectAiConsentModal({
  open,
  onClose,
  onConnect,
  initialConsentRead = false,
}: ConnectAiConsentModalProps) {
  const [consentRead, setConsentRead] = useState(initialConsentRead);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();
  const writeId = `${baseId}-write`;
  const readId = `${baseId}-read`;

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    const ok = await onConnect(consentRead);
    setConnecting(false);
    if (!ok) {
      setError("Could not start the AI session. Check your connection and try again.");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Connect an AI assistant
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Connecting lets your AI chatbot build and edit this project. You stay
            in control: the AI asks what to build before doing anything, and you
            choose what it can access.
          </Dialog.Description>

          <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <label htmlFor={writeId} className="flex items-start gap-3">
              <input
                id={writeId}
                name="aiConsentWrite"
                type="checkbox"
                checked
                disabled
                autoComplete="off"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span>
                <span className="font-medium text-gray-900 dark:text-gray-100">Write Mode</span>{" "}
                (required)
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  The AI can create and edit activities, estimates, milestones,
                  and notes in this project.
                </span>
              </span>
            </label>
            <label htmlFor={readId} className="flex items-start gap-3">
              <input
                id={readId}
                name="aiConsentRead"
                type="checkbox"
                checked={consentRead}
                autoComplete="off"
                onChange={(e) => setConsentRead(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span>
                <span className="font-medium text-gray-900 dark:text-gray-100">Read Mode</span>{" "}
                (optional)
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Let the AI read the current schedule and activity ids so it can
                  make context-aware edits. Required for dependency edits.
                </span>
              </span>
            </label>
          </div>

          {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-6 flex items-center justify-between">
            <a
              href={AI_PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              AI privacy notice
            </a>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
