// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link } from "react-router-dom";
import { HeadingRow } from "@ui/components/HeadingRow";

/**
 * Any address no route matches (FRAME26, v0.88.0). Until then React Router's own error page showed, with no frame at
 * all; contract §7 keeps a view's error inside `main` with the frame intact. No nav item leads here, so none is active.
 */
export function NotFoundPage() {
  return (
    <>
      <HeadingRow>Page not found</HeadingRow>
      <div className="sf-below">
        <p className="text-gray-600 dark:text-gray-300">There&apos;s no page at this address.</p>
        <Link
          to="/projects"
          className="mt-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          Back to Projects
        </Link>
      </div>
    </>
  );
}
