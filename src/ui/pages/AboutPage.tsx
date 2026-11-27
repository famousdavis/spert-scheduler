// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { APP_VERSION } from "@app/constants";
import { AI_PRIVACY_URL } from "@app/ai-connectivity-constants";
import { HeadingRow } from "@ui/components/HeadingRow";
import { copyrightYear } from "@ui/helpers/copyright-year";

/** The app's GitHub repository and Help Center address, as the Help Center's list (`help.ts`) gives them. */
const REPO_URL = "https://github.com/famousdavis/spert-scheduler";
const HELP_URL = "https://spertsuite.com/help/scheduler";
const CONNECT_AI_SETUP_URL = "https://spertsuite.com/help/connect-ai";
const CONNECT_AI_GUIDE = "SPERTScheduler_Connect_AI_Guide.pdf";

/**
 * The guides, exactly as the Help Center lists them (`spert-landing-page/src/data/help.ts`, landing v2.15.2): file,
 * title and description, in that order. frame-check compares each row with help.ts on GitHub's `main`, so a change
 * there is a change here.
 */
const GUIDES: readonly { file: string; title: string; description: string }[] = [
  {
    file: "SPERTScheduler_Quick_Reference_Guide.pdf",
    title: "Quick Reference Guide",
    description:
      "What Scheduler is and how it uses three-point estimates and Monte Carlo simulation to show how likely you are to finish by a date.",
  },
  {
    file: "SPERTScheduler_Import_Quick_Reference_Guide.pdf",
    title: "Import Activities from Spreadsheet",
    description:
      "How to bring an activity list from Excel or Google Sheets into Scheduler, and how each row is checked.",
  },
  {
    file: "SPERTScheduler_P6_MSProject_Import_Guide.pdf",
    title: "Import from P6 or MS Project",
    description: "How to move a Primavera P6 or Microsoft Project schedule into Scheduler by way of Excel.",
  },
  {
    file: CONNECT_AI_GUIDE,
    title: "Connect AI User Guide",
    description: "How to pair an AI assistant with your project so it can build and edit your schedule with you.",
  },
  {
    file: "CPM_Constraints_Critical_Path_Explainer.pdf",
    title: "When Scheduling Constraints Override the Critical Path",
    description:
      "A short primer on why a date constraint can drive your finish date while the highlighted critical path shows something else.",
  },
];

/** A registered-trademark mark: the glyph alone in the frame's `.sf-mark` (contract §4), which v4 scales to its line. */
function R() {
  return <span className="sf-mark">®</span>;
}

/** A trademark mark: the glyph alone, `.sf-mark--tm` (never the letters "TM"). */
function TM() {
  return <span className="sf-mark sf-mark--tm">™</span>;
}

/** The brand row's title, with its mark, as every shared sentence names the app. */
function Title() {
  return (
    <>
      SPERT<R /> Scheduler
    </>
  );
}

/** A link that opens a new tab: "↗" for the eye, "(opens in a new tab)" for screen readers (contract §7 About). */
function NewTab({ href, children, className, sr = " (opens in a new tab)" }: {
  href: string;
  children: ReactNode;
  className?: string;
  sr?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sf-sr">{sr}</span>
    </a>
  );
}

/**
 * The About page (FRAME26 pass 3, contract §3 About page and §7 About; v0.90.0). The heading row, then the page,
 * `div.sf-about[data-sf=about]`, as `main`'s next child: stylesheet v4 draws all of it (a 672 px column 16 px below the
 * heading row, the type, the guide rows and the Version and license block), so nothing inside carries a utility class or
 * a `dark:` one. The sections are §7's, in its order; the words are William's (2026-11-27): Scheduler's own from the
 * pass's words file, the shared ones from §7. Every ® and ™ is a `.sf-mark` holding the glyph alone.
 */
export function AboutPage() {
  return (
    <>
      <HeadingRow>
        About SPERT<span className="sf-mark">®</span> Scheduler
      </HeadingRow>
      <div className="sf-about" data-sf="about">
        <section>
          <h2>
            What is <Title />?
          </h2>
          <p>
            <Title /> is a lightweight, probabilistic project scheduling tool for professional project managers. It
            implements Statistical PERT (SPERT<R />) three-point estimation with Monte Carlo simulation to produce
            probabilistic project duration forecasts.
          </p>
          <p>
            Unlike traditional scheduling tools that produce a single deterministic finish date, <Title /> shows you
            the full range of possible outcomes and helps you answer questions like: &ldquo;How likely is it that we
            finish by this date?&rdquo;
          </p>
        </section>

        <section>
          <h2>How it works</h2>
          <ol>
            <li>Enter three-point estimates (optimistic, most likely, pessimistic) for each activity</li>
            <li>
              Select a subjective confidence level, which sets the spread of T-Normal, LogNormal, and Beta-PERT
              activities: through the SPERT Ratio Scale Modifier for T-Normal and LogNormal, and on the Statistical
              PERT<R /> Beta Edition scale for Beta-PERT
            </li>
            <li>
              Choose from T-Normal, LogNormal, Beta-PERT, Triangular, or Uniform distributions per activity (with
              automatic suggestions of T-Normal, LogNormal, or Triangular; Beta-PERT and Uniform are always your choice)
            </li>
            <li>Set an activity-level probability target (e.g., P50) for the deterministic schedule</li>
            <li>
              Run Monte Carlo simulation (10,000 trials by default) to generate a project duration distribution
            </li>
            <li>
              Set a project-level probability target (e.g., P95) to calculate the schedule buffer needed for your
              desired confidence
            </li>
          </ol>
        </section>

        <section>
          <h2>Beta-PERT and Parkinson&rsquo;s Law</h2>
          <p>
            Beta-PERT stays between Min and Max and peaks exactly at Most Likely. Its spread follows the Confidence
            level on the Statistical PERT<R /> Beta Edition scale (Medium: SD = range ÷ 6), so its middle value moves
            as Confidence changes. It is not the fixed PERT formula (O + 4M + P) ÷ 6.
          </p>
          <p>
            Parkinson&apos;s Law modeling (configurable): when enabled, simulated activity durations are never less
            than the scheduled duration, because work expands to fill the time allotted.
          </p>
        </section>

        <section>
          <h2>Connect AI</h2>
          <p>Pair a compatible AI assistant with your project to read and edit your schedule in real time.</p>
          <p>
            To connect, follow the steps for your assistant on the Help Center&apos;s{" "}
            <NewTab href={CONNECT_AI_SETUP_URL}>Connect AI setup page</NewTab>. The{" "}
            <NewTab href={`/${CONNECT_AI_GUIDE}`}>Connect AI User Guide</NewTab> explains what your assistant can do
            in <Title />. What it reads or changes passes through the SPERT<R /> Suite relay, whichever storage you
            use; the <NewTab href={AI_PRIVACY_URL}>AI Privacy Notice</NewTab> says what is kept and for how long.
          </p>
        </section>

        <section>
          <h2>Guides</h2>
          <ul className="sf-guides" data-sf="guides">
            {GUIDES.map((g) => (
              <li key={g.file} className="sf-guide">
                <div className="sf-guide-body">
                  <h3 className="sf-guide-title">{g.title}</h3>
                  <p className="sf-guide-text">{g.description}</p>
                </div>
                <NewTab href={`/${g.file}`} className="sf-guide-open" sr={`: ${g.title} (opens in a new tab)`}>
                  Open PDF
                </NewTab>
              </li>
            ))}
          </ul>
          <p>
            <NewTab href={HELP_URL}>More help in the Help Center</NewTab>
          </p>
        </section>

        <section>
          <h2>Your data and storage</h2>
          <p>
            Unless you sign in and choose cloud storage, <Title /> keeps your projects in this browser, on this device,
            and sends them to no server except through Connect AI, while an assistant is connected. Clearing this
            site&apos;s data deletes them, so export a backup from time to time.
          </p>
          <p>
            If you sign in, with Google or with a Microsoft work or school account, and choose cloud storage, your
            projects are saved to your account in Google Firebase, over encrypted (HTTPS) connections. You can then
            open them on any device and share them with other people.
          </p>
        </section>

        <section className="sf-about-legal" data-sf="about-legal">
          <h2>Version and license</h2>
          <p>
            Version {APP_VERSION} · <Link to="/changelog">What&rsquo;s new</Link>
          </p>
          <p>
            Created by William W. Davis, MSPM, PMP · <NewTab href={REPO_URL}>Source code on GitHub</NewTab>
          </p>
          <p>
            © {copyrightYear()} William W. Davis, MSPM, PMP. <Title /> is free software: you may use, change and share
            it under the GNU General Public License, version 3, with the additional terms its{" "}
            <NewTab href={`${REPO_URL}/blob/main/LICENSE`}>LICENSE</NewTab> adds under Section 7 of that license:
            attribution and legal notices, trademarks, the marking of modified versions, endorsement, and
            indemnification.
          </p>
          <p>
            SPERT<R />, Statistical PERT<R /> and Estimation Made Easy<R /> are registered trademarks of famousdavis,
            LLC. GanttApp<TM /> and MyScrumBudget<TM /> are trademarks of famousdavis, LLC.
          </p>
          <p>
            THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE
            STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM &quot;AS IS&quot; WITHOUT
            WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
            MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF
            THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY
            SERVICING, REPAIR OR CORRECTION.
          </p>
        </section>
      </div>
    </>
  );
}
