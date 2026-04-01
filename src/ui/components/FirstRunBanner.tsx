// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState } from "react";
import { LS_FIRST_RUN_SEEN, TOS_URL, PRIVACY_URL } from "@app/legal-constants";

function shouldShow(): boolean {
  return localStorage.getItem(LS_FIRST_RUN_SEEN) !== "true";
}

export function FirstRunBanner() {
  const [visible, setVisible] = useState(shouldShow);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(LS_FIRST_RUN_SEEN, "true");
    setVisible(false);
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4 flex items-center gap-4 no-print">
      <p className="text-sm text-blue-800 dark:text-blue-200 flex-1">
        SPERT® Suite web apps are free to use. No account is required to use
        them. By accessing or using this app, you agree to our{" "}
        <a
          href={TOS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-900 dark:hover:text-blue-100"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-900 dark:hover:text-blue-100"
        >
          Privacy Policy
        </a>
        . If you choose to enable optional Cloud Storage, you&apos;ll be asked
        to explicitly confirm your agreement.
      </p>
      <button
        onClick={dismiss}
        className="shrink-0 px-4 py-1.5 border border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-300 text-sm rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30"
      >
        Got it
      </button>
    </div>
  );
}
