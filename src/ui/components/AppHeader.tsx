// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link } from "react-router-dom";
import { APP_TAGLINE } from "@app/constants";
import { AuthButton } from "./AuthButton";
import { ThemeToggleButton } from "./ThemeToggleButton";

/** Scheduler's icon. There is one file for both themes; the frame shows the light or the dark copy by its class. */
const FAVICON = "/spert-favicon-scheduler.png";

interface AppHeaderProps {
  /** Opens the Storage & Sign In window. The account chip calls it in every state. */
  onOpenAuthModal: () => void;
}

/**
 * The frame's brand row (FRAME26, contract §3, v0.88.0): a 56 px band on the page ground, in the shared 1600 px
 * column. It never sticks; on a project's page the navigation row below it does (X3).
 *
 * The brand is ONE LINK to the Projects screen, the collection: the favicon and the title. It has no `aria-label`: its
 * accessible name is its visible title, "SPERT® Scheduler" (WCAG 2.5.3, label in name). Both favicons are decorative
 * (`alt=""`). Scheduler has one icon file, so the light and dark copies are the same image; the frame's stylesheet
 * shows one of them by its class, as every SPERT® app's does.
 *
 * The title is NOT a heading. The page's one `h1` is its heading row's, in `main` (contract §2).
 *
 * The title's colour (HDR26, v0.87.2; moved onto the frame at v0.88.0): Scheduler's favicon orange as a gradient on each
 * word, "SPERT" and "Scheduler", with the frame's `.sf-grad`. The ramps are `--app-grad-light` and `--app-grad-dark`,
 * set once on `:root` in `src/styles.css`. The ® between the words is the frame's muted `.sf-mark`. The fallbacks are
 * the frame's: solid in the frame's heading colour under `prefers-contrast: more`, solid black in print.
 *
 * ⚠️ The space before "Scheduler" is a text node of the title, OUTSIDE the gradient spans: inside a span, jsdom's
 * accessible-name computation trims it (WI-175). For the same contrast reason as HDR26's, the brand has no hover fade.
 */
export function AppHeader({ onOpenAuthModal }: AppHeaderProps) {
  return (
    <header className="sf-bar [overflow-anchor:none]">
      <div className="sf-col sf-bar-row">
        <Link to="/projects" className="sf-brand" data-sf="brand">
          <img src={FAVICON} alt="" className="sf-icon sf-icon--light ring-1 ring-white/20" data-sf="favicon" />
          <img src={FAVICON} alt="" className="sf-icon sf-icon--dark ring-1 ring-white/20" data-sf="favicon" />
          <span className="sf-title" data-sf="title">
            <span className="sf-grad">SPERT</span><span className="sf-mark">®</span>{" "}<span className="sf-grad">Scheduler</span>
          </span>
        </Link>
        <p className="sf-tagline" data-sf="tagline">{APP_TAGLINE}</p>
        <div className="sf-utils" data-sf="utils">
          <ThemeToggleButton />
          <AuthButton onOpenModal={onOpenAuthModal} />
        </div>
      </div>
    </header>
  );
}
