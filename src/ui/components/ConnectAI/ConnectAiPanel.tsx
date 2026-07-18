// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { getGeneratePairingCode } from "@infrastructure/firebase/firebase";
import { buildCopyPrompt } from "./copyPrompt";
import { AiActivityFeed, type AiFeedItem } from "./AiActivityFeed";
import type { AiSessionState } from "@ui/hooks/use-ai-connectivity";

interface ConnectAiPanelProps {
  open: boolean;
  onClose: () => void;
  sessionState: AiSessionState;
  onChangePermissions: (consentRead: boolean) => Promise<boolean>;
  onDisconnect: () => Promise<void>;
  feedItems: AiFeedItem[];
}

export function ConnectAiPanel({
  open,
  onClose,
  sessionState,
  onChangePermissions,
  onDisconnect,
  feedItems,
}: ConnectAiPanelProps) {
  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [copied, setCopied] = useState<"code" | "prompt" | null>(null);
  const [permError, setPermError] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionId = sessionState.sessionId;

  const fetchCode = useCallback(async () => {
    const callable = getGeneratePairingCode();
    if (!callable || !sessionId) {
      setCodeError(true);
      return;
    }
    setCodeLoading(true);
    setCodeError(false);
    try {
      const { data } = await callable({ sessionId });
      setCode(data.code);
    } catch {
      setCodeError(true);
    } finally {
      setCodeLoading(false);
    }
  }, [sessionId]);

  // Fetch a fresh code when the panel opens with an active session.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on open
    if (open && sessionId) fetchCode();
  }, [open, sessionId, fetchCode]);

  // Auto-refresh every 10 min, suppressed while the AI is actively connected.
  useEffect(() => {
    if (!open || !sessionId || sessionState.aiConnected) return;
    refreshTimerRef.current = setInterval(fetchCode, 10 * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [open, sessionId, sessionState.aiConnected, fetchCode]);

  const copy = async (kind: "code" | "prompt") => {
    if (!code) return;
    const text = kind === "code" ? code : buildCopyPrompt(code);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard blocked (permissions / insecure context) — user can select manually.
    }
  };

  const handleToggleRead = async () => {
    const ok = await onChangePermissions(!sessionState.consentRead);
    if (!ok) {
      setPermError(true);
      setTimeout(() => setPermError(false), 3000);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await onDisconnect();
    setDisconnecting(false);
    onClose();
  };

  const codeReady = !!code && !codeLoading;
  const displayCode = code ? code.replace("-", " · ") : "";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            AI session active
          </Dialog.Title>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Session code</p>
              {codeError ? (
                <div className="flex items-center gap-2">
                  <span className="text-red-600 dark:text-red-400 text-xs">Couldn&rsquo;t generate a code.</span>
                  <button onClick={fetchCode} className="text-xs text-blue-600 hover:underline">Retry</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg tracking-wide text-gray-900 dark:text-gray-100">
                    {codeReady ? displayCode : "••••• · ••••"}
                  </span>
                  <button
                    onClick={() => copy("code")}
                    disabled={!codeReady}
                    className="px-2 py-1 text-xs rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    {copied === "code" ? "Copied!" : "Copy Code"}
                  </button>
                  <button
                    onClick={() => copy("prompt")}
                    disabled={!codeReady}
                    className="px-2 py-1 text-xs rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    {copied === "prompt" ? "Copied!" : "Copy Prompt"}
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {codeLoading ? "Generating code…" : "Valid 15 min · refreshes automatically"}
              </p>
            </div>

            <p className="text-gray-600 dark:text-gray-300">
              Paste this into your AI chatbot. It will ask what to build before doing anything.
            </p>

            <p className="text-xs text-amber-700 dark:text-amber-400">
              ⚠ Don&rsquo;t switch projects while the AI is building.
            </p>

            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${sessionState.aiConnected ? "bg-blue-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"}`} />
              <span className="text-gray-600 dark:text-gray-300">
                {sessionState.aiConnected ? "AI connected" : "Waiting for AI…"}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-300">
                Permissions: <span className="font-medium">Write</span>
                {sessionState.consentRead && <span> · <span className="font-medium">Read</span></span>}
              </div>
              <button
                onClick={handleToggleRead}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                {sessionState.consentRead ? "Turn off Read" : "Turn on Read"}
              </button>
            </div>
            {permError && <p className="text-xs text-red-600 dark:text-red-400">Couldn&rsquo;t update permissions. Try again.</p>}

            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Recent AI activity</p>
              <AiActivityFeed items={feedItems} />
            </div>

            <div className="pt-2">
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full px-3 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
