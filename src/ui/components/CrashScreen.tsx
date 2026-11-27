// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useLayoutEffect } from "react";
import { crashScreenIsDark } from "@ui/helpers/crash-theme";

/**
 * The app's outermost crash screen (v0.89.0, FRAME26 clean-up E; contract §7, "Errors"): what shows when the frame
 * itself, a provider or a page fails. `main.tsx`'s `ErrorBoundary` shows it for a fault outside the router, and the
 * router's root `errorElement` for one inside it (until v0.89.0 that was React Router's own "Unexpected Application
 * Error!" page, with the error's stack and no way back). It stays OUTSIDE the frame on purpose: drawn inside it, a fault
 * in the frame would take the crash screen down too. It uses the page ground (#ffffff / #101828) and the frame's heading
 * and muted text colours, in the user's theme (re-applied here: `useTheme`, in Layout, may never have run), and offers
 * one way out, Reload. One wording in every SPERT® app (William, 2026-11-26).
 */
export function CrashScreen({ onReload = () => window.location.reload() }: { onReload?: () => void }) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", crashScreenIsDark());
  }, []);
  return (
    <div
      role="alert"
      data-crash-screen=""
      className="flex min-h-screen items-center justify-center bg-white p-8 text-center dark:bg-[#101828]"
    >
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-[#333333] dark:text-[#e2e8f0]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#6a7282] dark:text-[#99a1af]">
          SPERT<span className="sf-mark">®</span> Scheduler could not display this page. Reload to try again.
        </p>
        <button
          type="button"
          onClick={onReload}
          className="mt-6 h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
