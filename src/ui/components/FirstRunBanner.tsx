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
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
      <p className="text-sm text-blue-800 dark:text-blue-200">
        Statistical PERT® apps are free to use. No account is required.
        If you choose to enable optional Cloud Storage, you will be asked to
        review and agree to our{" "}
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
        .
      </p>
      <button
        onClick={dismiss}
        className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
      >
        Got it
      </button>
    </div>
  );
}
