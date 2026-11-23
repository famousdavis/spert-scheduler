// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
    // The frame's info notice (`.sf-notice--info`, contract §3 "Notices slot", v0.88.0): its colours, padding, radius
    // and the 28 px outlined "Got it" are the stylesheet's, and the links inherit the notice's text colour, underlined.
    <div className="sf-notice sf-notice--info no-print [overflow-anchor:none]">
      <p>
        SPERT® Suite web apps are free to use. No account is required to use
        them. By accessing or using this app, you agree to our{" "}
        <a
          href={TOS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
        . If you choose to enable optional Cloud Storage, you&apos;ll be asked
        to explicitly confirm your agreement.
      </p>
      <button type="button" onClick={dismiss} className="sf-notice-dismiss">
        Got it
      </button>
    </div>
  );
}
