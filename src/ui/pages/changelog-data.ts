// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    title: string;
    items: string[];
  }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.49.3",
    date: "2026-06-19",
    sections: [
      {
        title: "Security — updated the build toolchain to close three advisories",
        items: [
          "Upgraded the Vite build/development toolchain from 7.3.1 to 7.3.2 to close three published security advisories: two High-severity (an arbitrary file read via the dev-server WebSocket, and a server.fs.deny access-control bypass) and one Moderate (a path traversal in optimized-dependency source maps).",
          "This is a build-time-only change — Vite is not part of the shipped app — so there is no change to any feature, to your data, or to how the app behaves.",
          "Two remaining Windows-only advisories are intentionally deferred to a follow-up (around the end of July 2026), because their fix is in a Vite release that has not yet cleared our 60-day fresh-release waiting period.",
        ],
      },
    ],
  },
  {
    version: "0.49.2",
    date: "2026-06-10",
    sections: [
      {
        title: "Improved — export filenames now include a time-of-day stamp",
        items: [
          "Every file you export now has a THH-MM-SS time qualifier appended after the date (e.g. ...2026-06-10T15-48-30.json), so when several exports land in the same folder on the same day, the most recent one is obvious at a glance.",
          "Applies everywhere the app downloads a file: the per-tile single-project export, Settings → Export Projects, Settings → Schedule Export, the dashboard Export All / corrupted-project recovery exports, and the project-page schedule (XLSX/CSV) and simulation-results (CSV) exports.",
          "The time is your local wall-clock time and uses hyphens instead of colons so the filename stays valid on Windows, macOS, and Linux.",
        ],
      },
    ],
  },
  {
    version: "0.49.1",
    date: "2026-06-10",
    sections: [
      {
        title: "Added — one-click project export from the dashboard",
        items: [
          "Hover any project tile on the dashboard to reveal a new download icon — the first of the four icons in the tile's bottom-right corner. One click exports just that project as a JSON backup, with no trip to Settings → Export Projects.",
          "Exports are named spert-scheduler-<project name>-<date>.json, so each download is easy to attribute to a project (and to this app).",
          "It's the same JSON format as the Settings export and re-imports normally. Simulation results are excluded to keep the file small (the Settings export default), and global preferences are never bundled into a single-project export.",
        ],
      },
    ],
  },
  {
    version: "0.49.0",
    date: "2026-06-10",
    sections: [
      {
        title:
          "Improved — smarter forecasts for in-progress activities (conditional Monte Carlo sampling)",
        items: [
          'When an activity is in progress, the simulation now conditions on what it has observed — that the activity has already run for its elapsed time and isn\'t finished — instead of sampling as if it hadn\'t started. This fixes the classic "90%-done-for-three-weeks" optimism, where a long-running activity kept forecasting "almost done" no matter how far it overran.',
          'Each in-progress activity\'s Monte Carlo draws are conditioned on "duration > elapsed-so-far," so the P95 and the schedule buffer widen honestly as an activity slips — while the deterministic schedule and your published dates stay anchored to the plan.',
          'With Parkinson\'s Law turned off, an in-progress activity can no longer draw a duration shorter than the time it has already consumed (no more "finishing in the past").',
          "When an in-progress activity has run so long that its original estimate carries essentially no remaining information, the simulation flags it as model-exhausted rather than inventing a precise number — a prompt to re-estimate or split it. The simulation engine version advances to 1.1.0.",
          "Planned and complete activities, and all percentiles for projects without in-progress activities, are unchanged.",
        ],
      },
      {
        title:
          "Fixed — dependency-mode constraints in the synchronous simulation fallback",
        items: [
          "If the Web Worker failed to start and the simulation fell back to the main thread, dependency-mode runs silently ignored hard scheduling constraints (MSO/SNET/MFO/FNET), producing different percentiles than the normal worker path. The fallback now applies the same constraints as the worker.",
        ],
      },
    ],
  },
  {
    version: "0.48.0",
    date: "2026-06-04",
    sections: [
      {
        title: "Improved — redesigned project tiles on the dashboard",
        items: [
          "Grab anywhere on a project tile to drag and reorder it — the small dotted drag handle is gone. A single click still opens the project; a deliberate drag reorders it.",
          "Click a project's name to open it from the keyboard too (Tab to the name, then press Enter or Space).",
          "Action icons now live in the tile corners. The trash icon is always visible in the top-right; the share, archive, clone, and color-picker icons appear when you hover the tile (top-right delete, bottom-right archive/clone/color, bottom-left share).",
          "Deleting a project now uses the app's standard confirmation dialog (with dark-mode styling) instead of the plain browser pop-up.",
          "New Share icon (cloud mode, projects you own) opens a sharing dialog right on the dashboard — no need to open the project first.",
          "Choosing a tile color now tints the whole card with a soft wash of that color, in addition to the colored left edge, in both light and dark mode.",
          "The color picker moved to the bottom-right of the tile.",
        ],
      },
    ],
  },
  {
    version: "0.47.6",
    date: "2026-06-04",
    sections: [
      {
        title: "Improved — Gantt tooltips now wait for you to settle before appearing",
        items: [
          "Gantt tooltips (on activity bars, the finish-target line, and dependency arrows) now appear only after the cursor has rested on the same element for 1.5 seconds. Previously they appeared instantly and repositioned on every move, so sweeping the cursor across the chart popped a constant stream of flickering tooltips.",
          "Moving the cursor across the chart cancels each pending tooltip the moment you leave an element, so quick passes never surface a tooltip — you only see one when you deliberately pause on something.",
          "Once the delay elapses the tooltip still follows the cursor while you stay on that element, and the dependency-arrow highlight remains instant for responsive visual feedback.",
        ],
      },
    ],
  },
  {
    version: "0.47.5",
    date: "2026-06-03",
    sections: [
      {
        title: "Improved — resizable, taller Notes box in the Activity edit modal",
        items: [
          "The Notes field in the Activity edit modal (opened by clicking a Gantt bar or an activity's edit pencil) now opens at 5 lines instead of 3, showing two more lines of text without scrolling.",
          "A native grab handle in the bottom-right corner lets you drag the Notes box taller (vertical only) — the same handle style used elsewhere in the SPERT Suite. Because the resize is handled by the browser, releasing the mouse anywhere (even outside the modal or window) completes the resize cleanly.",
          "A minimum-height floor equal to the 5-line open size means you can grow the box but never drag it smaller than how it opens.",
        ],
      },
    ],
  },
  {
    version: "0.47.4",
    date: "2026-06-02",
    sections: [
      {
        title:
          "Fixed — Firestore serverTimestamp() write-path comments/test (internal) + Cloud Function timestamp consistency",
        items: [
          "Internal correctness and data-quality hardening around the updatedAt server timestamp written to spertscheduler_projects documents. No user-facing behavior change in the app itself.",
          "Corrected the v0.45.9 guard documentation and regression test. The comments in firestore-driver.ts and the test in firestore-driver.test.ts claimed the Firebase client SDK serverTimestamp() sentinel has no enumerable own properties and that the recursive sanitizeForFirestore pass degrades it to {}. That is not true for the installed SDK (firebase 12.11.0): the sentinel has an enumerable _methodName property, so the sanitizer rebuilds it as { _methodName: 'serverTimestamp' } — the exact shape that leaked into production project docs before v0.45.9 moved the sentinel to a post-sanitize sibling key. Comments now describe the real shape, and the test fixture uses the real production sentinel shape so the guard fails loudly (via reference-equality) if the sentinel is ever run back through the sanitizer. No behavioral change — all three current write paths (create, doSave, migrateLocalToCloud) were already correct.",
          "Cloud Function timestamp consistency (separate repo, deployed). The suite's claimPendingInvitations Cloud Function was writing updatedAt: Date.now() (a plain JS number) to spertscheduler_projects when a user claimed a project invitation — inconsistent with the Firestore Timestamp written by every other path. It now writes FieldValue.serverTimestamp(), so all live write paths to the collection produce a consistent Timestamp. Deployed to the spert-suite project; combined with the admin-tool patch of the existing pre-v0.45.9 sentinel docs, the collection is consistent end-to-end.",
        ],
      },
    ],
  },
  {
    version: "0.47.3",
    date: "2026-05-28",
    sections: [
      {
        title: "Fixed — local-mode projects and preferences reset on app reopen",
        items: [
          "In localStorage mode with Firebase configured, project data and user preferences could be reset when the app was reopened. This was a regression in v0.47.0–v0.47.2 (May 26–28, 2026); cloud-mode users and deployments without Firebase were never affected.",
          "Root cause: the onAuthStateChanged(null) Firebase callback — which fires on every page load to resolve the initial auth state — ran the sign-out cleanup sequence unconditionally, even when no user had ever signed in. At that moment StorageProvider's namespace effect had not yet run (it guards on authLoading), so the active namespace was still 'local'. The cleanup deleted every spert:project:local:* key in localStorage and reset all user preferences to defaults.",
          "The else-branch cleanup was added in v0.47.0 (audit finding E1-3) to clear residue after an externally-revoked session, but it was never gated for the initial-load case. The wasSignedIn flag added in v0.47.2 gated the recovery toast but not this cleanup call.",
          "The full impact while the regression was live: project tiles could appear briefly then vanish, or simply be empty on later reopens (projects reset); theme and default settings reset (preferences reset); last-active scenario tab reset (scenario memory reset).",
          "Fix: the cleanup call is now gated on hadSession — whether a non-null Firebase user was observed this page load. Genuine sign-out events (deliberate sign-out, ToS-mismatch forced sign-out, and externally-revoked credentials) are unaffected, and the v0.47.0 E1-3 hardening for revoked sessions is preserved (in-session revocation still runs cleanup). Two tests added: TC-5 (initial load does not clean up) and TC-6 (post-sign-in revocation still does). A test-only _resetSignOutFlagsForTests() export ensures test-order independence.",
          "Data already reset is not recoverable from localStorage. If you previously used Export All Projects, your .json export file is the recovery path.",
        ],
      },
    ],
  },
  {
    version: "0.47.2",
    date: "2026-05-28",
    sections: [
      {
        title: "Changed — surface the sign-out local-cache wipe to the user",
        items: [
          "When you sign out of cloud storage, SPERT Scheduler wipes the locally-cached copy of your cloud projects from this browser profile (v0.42.6 M4 hardening — prevents a shared device from leaking your data to the next user). Until now the wipe was completely silent across all three sign-out paths (deliberate sign-out, ToS version mismatch, externally-revoked credentials). A user who hadn't seen the auth event would return to an empty project list and reasonably conclude their data was lost.",
          "Deliberate sign-out (Path 1): the auth chip's Sign Out action now opens a confirmation modal explaining that locally-cached projects on this device will be removed and that the cloud-side data is unchanged. Cancel is default-focused (the non-destructive choice), matching the precedent set by KeepOrDiscardLocalModal.",
          "ToS mismatch or externally-revoked credentials (Paths 2 & 3): if the user's session ends without them having clicked Sign Out (token expiry, server-side revocation, forced sign-out from a ToS version bump), a persistent info toast now fires explaining what happened and that signing in again restores everything from cloud storage. The toast does NOT auto-dismiss — the default 3-second toast duration is too short for a 150+ character explanation of an empty project list. The user must dismiss it explicitly.",
          "Initial page loads with no auth session (no user ever signed in this session) suppress the toast — there is no cached state to explain.",
          "Classification is via two module-level flags in AuthProvider: expectedSignOut (set when the app initiates sign-out via useAuth().signOut()) and wasSignedIn (set when any authenticated user has been observed). The toast fires only when wasSignedIn && !expectedSignOut.",
          "The wipe itself is unchanged — the v0.42.6 security guarantee is preserved. The only difference is that the user is now informed.",
          "Regression tests added: 4 in SignOutConfirmModal.test.tsx (render + Cancel/Sign-out button behavior + default focus on Cancel) and 4 in AuthProvider.test.tsx (one TC per observable sign-out transition — Path 1 / Path 3 / initial-load-null — plus an explicit duration: 0 lock against future timeout normalization refactors).",
        ],
      },
    ],
  },
  {
    version: "0.47.1",
    date: "2026-05-27",
    sections: [
      {
        title: "Fixed — cloud storage create/delete races",
        items: [
          "Add Project race (critical, user-reported): in cloud storage mode, creating a new project produced a 'A project was removed because you no longer have access' toast followed by a 'Project Not Found' screen. Root cause was that addProjectListener was called synchronously in the 'create' branch before driver.create() resolved — the Firestore SDK sends the listen request and the setDoc request as independent operations and the listen frequently reached the server first, where the get rule evaluated against a null resource → permission-denied → the v0.45.3 eviction path fired. The listener is now attached inside the .then() callback of driver.create(), matching the loadAll and spert:models-changed paths which already gate on a confirmed Firestore read.",
          "Zombie reappear on delete — Path A (loaded project + concurrent edit): a project loaded via loadAll or spert:models-changed has a real-time listener attached. User clicks Delete. Before deleteDoc acks, a collaborator's server-side edit triggers an onSnapshot delivery. mergeProject sees existing === undefined and falls into the [...state.projects, merged] branch, re-inserting the deleted project. Fixed by refactoring unsubscribersRef from Unsubscribe[] to Map<string, Unsubscribe> (eliminating the now-redundant listenedIdsRef) and tearing down the project's listener inline in the 'delete' branch before driver.remove() fires.",
          "Zombie reappear on delete — Path B (fast add-then-delete during in-flight create): emitDelete fires before driver.create() resolves. No listener exists yet to tear down. When create eventually resolves, the .then() callback would normally attach a listener, whose initial snapshot would then re-insert the locally-deleted project. Fixed by adding a getProject(project.id) guard in the create's .then() callback — since deleteProject's set() runs before emitDelete fires, getProject is already undefined by .then() time and addProjectListener is skipped.",
          "Failed-create ghost project: if driver.create() rejects (network outage, transient backend error), the .catch() previously left the project in the local store. Each subsequent edit emitted emitSave → doSave → setDoc({mergeFields}) against a never-written document → Firestore's create rule rejected (no members in payload) → PERMISSION_DENIED on every keystroke. The .catch() now also calls driver.cancelPendingSave(project.id) (kills any debounced save the user armed during the in-flight create) and removeProjectLocally(project.id) (rolls back the local entry). removeProjectLocally is correct rather than deleteProject because the document was never written, so emitDelete / driver.remove() must not fire.",
          "Bug 2 explicitly retired in code comments: an earlier draft proposed chaining doSave calls behind the in-flight create. The Firestore SDK (memoryLocalCache) serializes writes from a single client through an internal mutation queue (FIFO), so driver.create()'s setDoc is always enqueued before any subsequent doSave() setDoc and the server processes them in submission order regardless of network latency. No chaining is needed; a comment in the 'save' branch documents the invariant in place of the absent code.",
          "Regression tests added: use-cloud-sync-create.test.ts (4 tests — TC-1 Bug 1, TC-2 Path B, TC-3 Path A, TC-4 failed-create rollback).",
        ],
      },
    ],
  },
  {
    version: "0.47.0",
    date: "2026-05-26",
    sections: [
      {
        title: "Fixed — cloud storage hardening (7 findings from dual audit)",
        items: [
          "Scenario notes textarea: added echo guard (local buffer + focus guard ref) preventing server-ack snapshots from overwriting in-progress typing. Per-keystroke commits preserved so undo/redo grouping continues to work correctly. Character count now reflects typed text during focus rather than the lagging store value (A3-1).",
          "Permission-denied eviction: pending debounced save is now cancelled before project is removed from local state, eliminating a spurious 'Cloud sync error' toast that appeared alongside the 'project removed' message (I2-1).",
          "Externally-revoked sign-out (token expiry) now runs full cleanup — zeroing in-memory state and clearing per-user localStorage — matching the behavior of user-initiated sign-out. All cleanup steps are idempotent for the double-run that follows explicit sign-out (E1-3).",
          "driver.load(): re-attaches owner from the raw Firestore document after Zod parse, matching the existing pattern in subscribeToProject and processProjectDoc (H2-1).",
          "spert:models-changed re-fetch: added data-loss guard matching the initial-load path; a transient 0-project response no longer wipes the in-memory project list (I1-1).",
          "setProjects: preserves in-memory simulationResults for already-loaded projects during re-fetches, applying the same mergeWithLocalSimulationResults helper introduced in v0.46.4. Benefits both the invitation-claim re-fetch path and the initial cloud load (SC1-1).",
          "Changelog date parsing: documented pre-merge grep guard scoped to the date: field to catch placeholder dates before they reach production (M3-1).",
        ],
      },
    ],
  },
  {
    version: "0.46.4",
    date: "2026-05-24",
    sections: [
      {
        title: "Fixed — simulation results no longer vanish moments after Run in cloud mode",
        items: [
          "In cloud storage mode, clicking Run Simulation showed results that then disappeared within a second. The bug did not occur in local mode and was invisible offline. Root cause was a Firestore-echo race against the Zustand store.",
          "setSimulationResults wrote the new run into the in-memory store and queued a cloud save. FirestoreDriver.save() (debounced 200 ms) calls stripSimulationResultsForCloud() before writing — simulation results are large, transient, and recomputable, so they never round-trip through Firestore.",
          "Firestore acknowledged the write and fired an onSnapshot echo with hasPendingWrites: false. The driver's existing hasPendingWrites guard catches only the optimistic local-write snapshot; this second snapshot passed through and reached mergeProject, which wholesale-replaced the in-memory project with a copy that had simulationResults: undefined on every scenario. The user's results were silently wiped.",
          "mergeProject now preserves in-memory simulationResults per-scenario (matched by scenario ID) when a snapshot arrives. Simulation results are local-only ephemeral state — we never accept them from a Firestore snapshot. Lookup-by-ID correctly handles collaborator scenario add/remove/reorder.",
          "setSimulationResults no longer emits a cloud save. The cloud save it triggered produced no useful Firestore delta (results are stripped on the way out) and was the most common trigger of the echo race. localStorage save is preserved.",
          "A new mergeWithLocalSimulationResults helper encodes the preservation logic at module scope to keep mergeProject's nested-function depth within lint limits.",
          "Known gap (documented in setProjects): the initial cloud-load and spert:models-changed re-fetch path still wholesale-replaces state. Acceptable today because the initial load runs before the user can compute anything, and models-changed only fires on invitation claims.",
          "Regression tests added: echo with simulationResults: undefined preserves the in-memory run; a remote-added scenario has simulationResults: undefined while existing scenarios retain theirs; setSimulationResults emits no cloudSyncBus save event.",
        ],
      },
    ],
  },
  {
    version: "0.46.3",
    date: "2026-05-24",
    sections: [
      {
        title: "Changed — About page QRG button label standardized",
        items: [
          "Renamed the QRG download button from \"Quick Reference Guide\" to \"Open Quick Reference Guide (PDF)\" so the label matches the canonical convention used across the SPERT® Suite (Forecaster, MyScrumBudget, AHP, Story Map).",
        ],
      },
      {
        title: "Fixed — footer \"Keyboard shortcuts\" link styled blue",
        items: [
          "The \"Keyboard shortcuts\" button in the global footer was the only footer link rendered in gray. All sibling links (Version, SPERT® Suite, Terms of Service, Privacy Policy, License) use the blue link color. Restyled to match.",
        ],
      },
    ],
  },
  {
    version: "0.46.2",
    date: "2026-05-24",
    sections: [
      {
        title: "Fixed — milestone names + project/scenario rename inputs no longer drop characters in cloud mode",
        items: [
          "v0.46.1 fixed the activity grid name input and section header name input against the cloud-sync echo race. v0.46.2 extends the same fix to two component files (MilestonePanel + the shared InlineEdit), covering three rename sites.",
          "Milestone name (MilestonePanel) — was a fully controlled per-keystroke input, identical to the pre-v0.46.1 activity name pattern.",
          "Project rename and scenario tab rename — both backed by the shared InlineEdit component, which had the same useState + sync useEffect pattern as pre-v0.46.1 BandHeaderRow (sync without focus guard, vulnerable to mid-typing overwrite from server-ack snapshots).",
          "InlineEdit was migrated to use useBufferedField internally; both call sites inherit the fix. To support InlineEdit's reject-empty-trim policy, the hook's onCommit callback now receives a controls argument (controls.reset()) that allows a caller to resync the buffer after a rejected commit — distinct from revertValue() (which reverts to the focus-time snapshot and arms the Escape/blur-suppress flag). BufferedFieldControls is exported from the hook for use at call sites.",
          "InlineEdit's Enter handler now calls inputRef.current?.blur() explicitly before exiting edit mode. The prior implementation relied on React firing a synthetic blur event during the conditional unmount of the focused input — version-inconsistent behavior. The explicit .blur() removes the dependency.",
          "Same behavioral semantics as v0.46.1 apply to all three sites: commit timing is now per-edit-session (focus loss / Enter / click-away) instead of per-keystroke; external rename while focused is suppressed (last-blur-wins); a focused-and-blurred-without-typing field does not overwrite remote updates that arrived during focus.",
        ],
      },
      {
        title: "Added — Escape revert on milestone name input",
        items: [
          "Pressing Escape on a milestone name input now reverts the typed text to the value at the time of focus. No Escape handling existed on this input before v0.46.2.",
        ],
      },
      {
        title: "Changed — Escape revert on InlineEdit (project + scenario rename) now uses focus-time snapshot",
        items: [
          "Previously, InlineEdit's Escape reset to the current prop value at the time of Escape. The new behavior reverts to the value at the time the user entered edit mode (the focus-time snapshot). In a concurrent-edit scenario, this means Escape shows the value the user saw when they started editing, not a value that arrived from a collaborator mid-edit. The display span shows the current store value once edit mode exits in both cases.",
        ],
      },
      {
        title: "Not migrated (intentionally)",
        items: [
          "The ActivityEditModal name field and notes textarea are not migrated. The modal uses useState(prop) initializers without a sync useEffect; while open, the modal's local state is not subscribed to external store updates. It commits atomically on the Save button with no per-keystroke write path. Migrating it to useBufferedField would not fix a real bug.",
          "The NewProjectDialog, NewScenarioDialog, and CloneScenarioDialog follow the same Save-button pattern and are similarly unaffected.",
        ],
      },
    ],
  },
  {
    version: "0.46.1",
    date: "2026-05-23",
    sections: [
      {
        title: "Fix — activity name and section header name inputs no longer drop characters in cloud mode",
        items: [
          "The activity name input and the section (band) header name input no longer drop or revert characters during cloud sync. The bug was structural and exposed in v0.45.7: per-keystroke controlled input + per-keystroke debounced cloud save means every debounced Firestore write produces a server-ack snapshot (hasPendingWrites: false) that flows back through subscribeToProject → mergeProject and replaces the project in the Zustand store with the value at debounce-fire time — silently overwriting any keystrokes typed since.",
          "Reverting v0.45.7's 500ms → 200ms debounce reduction is not the fix: fast typists hit the same race at 500ms, and the shorter window is needed to prevent losing click-driven changes on fast refresh. The fix is at the input layer.",
          "Both inputs now buffer their value in local state via a new useBufferedField hook. While focused, external state updates (Firestore echoes, undo, collaborator renames) are ignored. On focus loss the buffer commits to the store if and only if the typed value differs from the value the user saw when they focused the field (a focus-time snapshot, not compared against the live external value). A user who focuses and blurs without typing never overwrites a remote update that arrived while focused.",
          "Commit timing: name persists on any focus loss (Tab, Shift+Tab, Enter, click-away, modal open) — not per keystroke. Undo granularity changes from per-keystroke to per-edit-session.",
          "Enter (activity name) commits via the resulting blur and advances focus to the next tab-order field (Min in standard mode, ML in heuristic mode). Enter (section header) commits via blur and advances focus to the Add Activity button. Escape reverts to the value at the time the field was focused.",
          "Concurrent-edit note: if a collaborator renames a field while your cursor is in it, your focus-loss value wins (last-blur-wins; accepted for a primarily single-user tool).",
          "Follow-up (v0.46.2): the ActivityEditModal name field and notes textarea (highest impact remaining — long-form typing), milestone names, scenario rename, and project rename carry the same structural exposure and will be moved onto useBufferedField next.",
        ],
      },
    ],
  },
  {
    version: "0.46.0",
    date: "2026-05-23",
    sections: [
      {
        title: "Added — insert an activity at any position in the grid",
        items: [
          "The activity grid now supports inserting a new blank activity at any row position, not just appending to the bottom. Hover between any two rows to reveal an inline insert strip with a small ⊕ marker; click it to add a new activity at that exact position. The new row's name input auto-focuses immediately so you can type without an extra click.",
          "After an activity row: the new activity is spliced immediately after the hovered one. Existing bands are untouched.",
          "After a band header row: the new activity joins the band's section with correct anchor semantics in every case — single-band groups, multi-band shared-anchor groups (only bands at-or-before the clicked one re-anchor; later siblings keep their original anchor), and trailing bands (earlier trailing bands move with the new activity, later trailing bands stay trailing).",
          "Suppression rules: the strip is hidden on the last row in the grid (since \"+ Add Activity\" covers that case), on locked scenarios, and while any row is being dragged.",
          "Accessibility: the strip is mouse-accessible in this release, consistent with the existing edit-pencil precedent. Keyboard-driven positional insert is a planned follow-up.",
          "Implementation: new pure service functions insertActivityAfter and insertActivityAfterBand; new store actions insertActivityAfterActivity and insertActivityAfterBand that return the new activity's ID on success and pre-check the snapshot to avoid phantom undo + persist + cloud emit on no-op paths; useGridFocus extended with signalActivityAddById and an existence-check that defends the cloud-sync race; drag suppression wired through DndContext's lifecycle callbacks into local grid state.",
        ],
      },
    ],
  },
  {
    version: "0.45.9",
    date: "2026-05-22",
    sections: [
      {
        title: "Cloud — fourth pass: the actual root cause was a Zustand commit-order race",
        items: [
          "The Gantt color persistence bug we chased through v0.45.6 → v0.45.7 → v0.45.8 was never a Firestore problem. The real failure was a synchronous execution-order race: persist() calls cloudSyncBus.emitSave(projectId) synchronously while still inside the Zustand set((state) => ...) updater. The bus subscriber in use-cloud-sync.ts reads the project back via useProjectStore.getState(), which returns the COMMITTED state — but Zustand hasn't committed yet, so the bus handed driver.save() the PRE-update project. Firestore got the stale snapshot, onSnapshot echoed it back into local state, and the user's change was silently dropped.",
          "Why localStorage was fine: repo.save(project) inside persist receives the new project by argument and writes the correct data directly — it never re-reads getState(). Local-mode users never saw the bug.",
          "Why v0.45.6 helped partially: the deleteField() sentinels still removed the prior customs from Firestore even when the bus emit fired with a stale read, so stale colors from earlier sessions stopped resurrecting. The newly-picked color was never in any payload, ever. v0.45.7's debounce reduction and v0.45.8's mergeFields switch were both no-ops for this bug — they attacked the write semantics, but the right payload never reached the write path.",
          "Fix: persist() in use-project-store.ts now defers cloudSyncBus.emitSave with queueMicrotask. The microtask runs after the set() updater returns and commits, so the subscriber's getState() read sees the committed state. The microtask is consumed by the existing 200 ms debounce window — no perceptible delay.",
          "Secondary fix: serverTimestamp() was being silently corrupted into {} by the recursive sanitizeForFirestore pass — Object.entries(sentinel) returns [] for the Firestore FieldValue, so the sanitizer rebuilt it as an empty map. Production saves have been writing updatedAt: {} instead of a real server timestamp. doSave and create now attach updatedAt: serverTimestamp() AFTER the sanitize pass so the sentinel survives intact.",
          "Regression tests: persist → emitSave ordering test in use-project-store.test.ts subscribes to the bus, fires updateGanttAppearance with a new custom color, and asserts the subscriber sees the post-update state. Driver test mocks serverTimestamp() with a sentinel-shape object and asserts the same reference arrives at setDoc.",
          "Credit: independent codebase review caught what three rounds of Firestore-focused debugging missed.",
        ],
      },
    ],
  },
  {
    version: "0.45.8",
    date: "2026-05-22",
    sections: [
      {
        title: "Cloud — third pass: replace merge:true with mergeFields for Gantt color saves",
        items: [
          "Diagnosis: the v0.45.6 deleteField() fix worked for clearing stale sub-fields, but mixing deleteField() sentinels with regular values inside the same nested ganttAppearance map (deleteField for customPlannedColor next to a real string for customCompletedColor) was unreliable in practice — the freshly-set sibling value did not survive end-to-end. The Blue-preset-then-pick-green sequence kept losing the green Completed color even after waiting a long time before refresh.",
          "Switched doSave from { merge: true } to { mergeFields: [...] }. Each top-level field listed in mergeFields is wholesale REPLACED on the server document — no deep merge and no sentinels. The ganttAppearance map is now atomically swapped out on every save; cleared sub-fields are simply absent from the new map. Owner/members are explicitly excluded from mergeFields so the debounced save path never touches the ACL fields managed by create() and removeCollaborator().",
          "Removed sanitizeForFirestoreMerge() and its tests — no longer needed. Both create() and doSave() use the original strip-undefined sanitizeForFirestore now.",
          "Rewrote the v0.45.6 driver regression to assert the new mergeFields semantics: freshly-set color present in payload, cleared sub-fields absent (no sentinels), mergeFields contains ganttAppearance/scenarios/updatedAt and excludes owner/members.",
        ],
      },
    ],
  },
  {
    version: "0.45.7",
    date: "2026-05-22",
    sections: [
      {
        title: "Cloud — second pass: custom colors persist through fast browser refresh",
        items: [
          "Follow-up to v0.45.6. The deleteField() fix closed the deep-merge bug that resurrected stale customs, but exposed a separate race: click Blue preset → click green for Completed → fast Cmd-R, and the green save was lost because the 500ms debounce hadn't fired yet, the beforeunload flush only started the setDoc request, and the page unloaded before the network round-trip completed. v0.45.6's refresh-window toast suppression made the failure silent.",
          "Shortened the save debounce from 500ms to 200ms. 200ms still batches normal typing (most users have >250ms gaps between keystrokes) but is fast enough that click-driven changes commit before a manually-issued refresh. Rationale documented at the save() method in firestore-driver.ts.",
          "Added pagehide as a secondary flush trigger alongside beforeunload in use-cloud-sync.ts. pagehide is the standards-track replacement and fires more reliably on mobile and across the bfcache path. Both events route through the same handleBeforeUnload callback so the unload latch and pending-save flush stay in lockstep.",
          "Regression test in firestore-driver.test.ts locks the 200ms debounce window: no fire at 150ms, fires by 250ms.",
        ],
      },
    ],
  },
  {
    version: "0.45.6",
    date: "2026-05-22",
    sections: [
      {
        title: "Cloud — custom Gantt colors persist correctly + quieter refresh",
        items: [
          "Fix: custom Gantt bar colors no longer revert after a browser refresh in cloud mode. The Firestore save path uses setDoc with { merge: true } to preserve owner/members, but Firestore's deep merge means keys that transitioned to undefined locally (e.g. a preset click clearing customPlannedColor / customInProgressColor / customCompletedColor) were silently left in place on the server document. The sanitizer stripped those keys instead of marking them for deletion, so the stale values reappeared on next load. New sanitizeForFirestoreMerge in firestore-sanitize.ts replaces undefined map-keys with Firestore's deleteField() sentinel; doSave uses it, while create() keeps the existing strip-undefined behavior. Arrays still strip-undefined — they're atomic under merge:true and deleteField() is forbidden inside array elements.",
          "Suppressed the \"Cloud sync error — changes may not have saved. Check your connection.\" toast during two narrow false-positive windows: (a) the first ~2 seconds after the initial cloud load settles (where write-forward migration saves and other transient races can fire) and (b) any period after beforeunload has latched (where in-flight setDoc calls can race a hard refresh). Errors continue to log to the console regardless, and real connectivity errors during an active editing session still surface normally.",
          "New regression tests in firestore-sanitize.test.ts (merge sentinels for cleared keys, array element handling) and firestore-driver.test.ts (doSave payload contains the delete sentinel for cleared Gantt color fields).",
        ],
      },
    ],
  },
  {
    version: "0.45.5",
    date: "2026-05-22",
    sections: [
      {
        title: "Bug fix — no more phantom uncertainty hatching on completed activities",
        items: [
          "Completed activities without an actualDuration no longer render uncertainty hatching on the Gantt chart. The gate in computeActivityUncertaintyDays (src/core/schedule/deterministic.ts) previously required both status === 'complete' AND actualDuration != null to suppress hatching; if either was missing, the activity fell through to the planned/in-progress branch and picked up projectTarget − activityTarget hatching. Any status === 'complete' activity now returns hatchedDays = 0, with the solid bar falling back to the deterministic duration when actualDuration is missing.",
          "Mark-complete data consistency: the single-row status dropdown (UnifiedActivityRow.tsx) and the Activity Edit modal (ActivityEditModal.tsx) now default actualDuration to the scheduled deterministic duration when a user flips status to 'complete' without an actualDuration entered — mirroring the bulk Mark-complete path in UnifiedActivityGrid.tsx that already did this. Closes the entry point that left activities in the inconsistent state in the first place.",
          "Regression test added in deterministic.test.ts covering the complete-without-actualDuration case.",
        ],
      },
    ],
  },
  {
    version: "0.45.4",
    date: "2026-05-22",
    sections: [
      {
        title: "Section headers — inline rename in the Gantt + tinted rows in the grid",
        items: [
          "Section header names can now be edited directly on the Gantt chart by clicking the section label, mirroring the existing inline-rename behavior on activity names. Enter commits, Escape cancels, blur commits. The chart's input overlay reuses the same positioning math; for bands it looks up the band's slot from renderItems (the unified activity+band render list) rather than the activity-only rowIndex. Rename is disabled when the scenario is locked.",
          "In the Activity Grid, picking a color for a section from the band color picker now also paints the row background with a faint matching tint (default alpha 0.18). Choosing \"None\" reverts to the standard gray. The tint is derived in JS rather than via color-mix() so behavior matches the v0.44.3 cross-browser guarantees.",
          "New src/ui/helpers/color-utils.ts adds hexToRgb() and hexToTintedBackground() with their own tests. The latter returns null for invalid hex so callers fall back to default styling on garbage input.",
        ],
      },
    ],
  },
  {
    version: "0.45.3",
    date: "2026-05-22",
    sections: [
      {
        title: "Security — close three findings from the v0.45.2 audit",
        items: [
          "UID-namespace the spert:user-preferences and spert-scheduler:active-scenarios keys. v0.42.6 (M4) namespaced the project keys but left preferences and the last-active-scenario map under single shared keys. On a shared device, if User A's session ended without an explicit sign-out (crash, tab close), the next user on the same browser could pick up A's preferences — especially in local mode, where no cloud sync overwrite fires. Both keys now key as :{namespace} (\"local\" when signed out / local mode, UID when cloud). Sibling pattern to local-storage-repository.ts. Pre-v0.45.3 unscoped keys auto-migrate to :local on module load with read → write-and-verify → delete ordering so a mid-migration crash leaves data under both keys, never under neither. clearPreferences and clearAllLastScenarios now scope to the active namespace only.",
          "Bump simulation generation on mode-switch teardown. The sign-out cleanup in StorageProvider calls bumpSimulationGeneration() before cancelPendingSaves() so any worker callback still in flight short-circuits before touching the about-to-be-cleared store. The useCloudSync mode-switch teardown (Cloud → Local, including the Discard path) skipped the bump and relied on updateScenarioInList no-op'ing on missing IDs. That's benign today but a defense-in-depth gap. The hook now matches the registry's ordering: bump first in both the cleanup return and the Cloud → Local else branch.",
          "Evict the local mirror on permission-denied snapshot errors. When a project owner removes another member, the removed member's open onSnapshot subscription fails with permission-denied. The error callback used to log and drop the listener ID, but leave the project in the in-memory store — the user kept seeing stale data with no signal they'd lost access. New removeProjectLocally store action — strictly analogous to deleteProject minus cloudSyncBus.emitDelete — is called from the subscribeToProject error path when code === \"permission-denied\". Surfaces a user-friendly toast (\"A project was removed because you no longer have access.\") so the user understands what happened.",
          "1,520 tests passing (up from 1,505 — 15 new tests cover namespace isolation, legacy-key migration idempotency, mid-migration crash recovery, and cross-namespace clear* scoping for both preferences and scenario memory).",
        ],
      },
    ],
  },
  {
    version: "0.45.2",
    date: "2026-05-22",
    sections: [
      {
        title: "Refactor — extract clean seams across files modified since v0.42.5",
        items: [
          "project-service.ts: cloneScenario's two ID-remap passes (activities + milestones) now share a generic cloneWithIdRemap helper that returns { items, idMap }. Behavior unchanged; covered by existing tests.",
          "ProjectPage.tsx: the 40-field useShallow store selector that dominated the top of the component is now useProjectActions() in src/ui/hooks/use-project-actions.ts. Same fields, same subscription semantics.",
          "PrintableReport.tsx: print-only section JSX extracted into seven sub-components in src/ui/components/print-sections.tsx (Summary, Activity Table, Dependencies, Constraints, Item Table, Milestones, Simulation Results). The main component is now a clean composition. No visual or print-output change.",
          "UnifiedActivityGrid.tsx: focus and selection state extracted into useGridFocus and useGridSelection hooks in src/ui/hooks/use-grid-state.ts. Add buttons call signalActivityAdd() / signalBandAdd() instead of poking useRef.current = true. Identical keyboard, drag, and bulk-action behavior.",
          "All 1,505 tests pass; lint baseline unchanged at 18 errors / 1 warning. No dependency upgrades and no changes to the import subsystem.",
        ],
      },
    ],
  },
  {
    version: "0.45.1",
    date: "2026-05-22",
    sections: [
      {
        title: "Gantt chart — Finish Target now always visible when toggled on",
        items: [
          'Fix: when the "Finish Target" toggle is on and the target date falls past the buffered project finish, the dashed target line is now drawn at the right edge of the Gantt chart instead of being silently clipped out of view. The empty stretch between the buffer line and the target marker visualizes available slack to target.',
          "The timeline range automatically extends to include the target date in both the interactive Gantt and the printable PDF report. Bars compress proportionally in fit-to-window mode; fixed-density (week/month) modes scroll further.",
          "Tick suppression now also avoids drawing a quarter, month, or semi-annual tick gridline directly underneath the target dashed line — preventing a visual merge when the target falls on a tick boundary.",
          'Label cleanup: the Gantt appearance toggle "Show Finish Target Date" is renamed to "Finish Target" — shorter and matches the "Finish Target" field label in the project summary card. The chart legend entry "Target" is also renamed to "Finish Target" so the legend mirrors the canonical name. The compact "Target" label that sits directly above the dashed line on the chart is unchanged — its position next to the line provides its own context.',
        ],
      },
    ],
  },
  {
    version: "0.45.0",
    date: "2026-05-22",
    sections: [
      {
        title: "New Feature — Section Headers",
        items: [
          'New "+ Section" button next to "+ Add Activity" inserts a section header at the bottom of the list; drag it to any position',
          "All activities following a section header appear below its label on the Gantt chart",
          "Each section header has an editable name, an optional color chosen from a palette, and a delete button",
          "Up to 50 section headers per scenario are supported",
          "Locked scenarios prevent all changes to section headers",
          "Section headers appear in the Gantt chart as a bold label with a horizontal rule spanning the full chart width",
          "Section headers appear in printed PDF reports",
          "Section headers appear in CSV and Excel exports as labeled rows",
          "CSV and Excel re-import skips section rows without error; section labels are not reconstructed on re-import — export to JSON to preserve section headers across export/import round-trips",
          "Section headers carry no scheduling logic and do not affect simulation results",
        ],
      },
    ],
  },
  {
    version: "0.44.3",
    date: "2026-05-22",
    sections: [
      {
        title: "Scenario comparison — table copy actually works now",
        items: [
          "Fix: the comparison-table copy button was still failing in v0.44.2. Root cause: the table's alternating-row class compiles in Tailwind v4 to a color-mix(in oklab, ...) expression that html2canvas couldn't parse. The neutralizer now recognizes oklch, oklab, and color-mix and routes all three through Canvas2D's fillStyle. Every copy-image button in the app benefits — same fix applies wherever Tailwind v4 opacity modifiers are used in a captured region.",
        ],
      },
    ],
  },
  {
    version: "0.44.2",
    date: "2026-05-21",
    sections: [
      {
        title: "Scenario comparison — copy fixes",
        items: [
          "Fix: the copy-image button on the metrics table now works. Failure was caused by html2canvas being unable to compute bounds on a bare wrapper div inside the inline-block + overflow-hidden comparison container; the captured element now has explicit bg-white + inline-block styling.",
          "Fix: removed a duplicate copy button that was floating in the top-right of the cumulative distribution chart. The component-internal button predated the v0.44.0 chrome additions and was no longer needed once the parent provided its own.",
          "Copy failures now log the underlying error to the browser console in addition to showing the toast — useful for diagnosing future issues.",
        ],
      },
    ],
  },
  {
    version: "0.44.1",
    date: "2026-05-21",
    sections: [
      {
        title: "Scenario comparison — copy button placement fix",
        items: [
          "The copy-image button on the comparison table was overlapping the rightmost scenario name when names were long. Replaced the floating top-right placement with a header bar above the table (label on the left, copy button on the right). The CDF chart got the same chrome treatment for consistency. Neither header is in the captured screenshot — what you paste is still the data alone.",
        ],
      },
    ],
  },
  {
    version: "0.44.0",
    date: "2026-05-21",
    sections: [
      {
        title: "Gantt customization",
        items: [
          "The Completed bar color can now be customized per project, just like the Planned and In Progress bar colors. Choose a custom color from the swatch picker in the Gantt appearance panel, or click any color preset to reset all three back to the preset's values.",
        ],
      },
      {
        title: "Scenario comparison",
        items: [
          "The scenario comparison view now has two copy-image buttons — one for the metrics table and one for the cumulative distribution chart. One click copies a clean PNG to your clipboard; paste directly into slides, docs, or any program that accepts images.",
        ],
      },
    ],
  },
  {
    version: "0.43.0",
    date: "2026-05-20",
    sections: [
      {
        title: "Import — Level 4 retrograde",
        items: [
          "Import now detects name conflicts in addition to ID conflicts, with separate per-conflict resolution (skip / replace / copy). ID conflicts default to 'skip' (avoiding silent overwrite); name conflicts default to 'copy' (incoming is probably worth keeping).",
          "In cloud mode, the file picker now waits for your projects to finish loading before enabling — preventing imports against an empty list during sign-in or invitation-claim refresh. An amber notice explains the wait.",
          "If your cloud projects loaded (or were refreshed by a peer invitation claim) while a preview was open, the conflict list rebuilds automatically and an amber banner reports what changed (conflicts that vanished, new conflicts, kind changes).",
          "Copying an imported project now produces a disambiguated name (e.g., \"Q4 Plan (Copy)\", \"Q4 Plan (Copy 2)\") with fully regenerated internal IDs — re-importing the same file no longer creates aliased scenarios or activities.",
          "Fix: replacing a cloud-shared project on import now preserves its owner, sharing settings, creation date, and archived status. Previously the imported file's owner field could overwrite these (the rules engine prevented data loss, but the metadata was silently changed in the in-memory state).",
          "Fix: importing a file that includes user preferences now offers an opt-in toggle (default off) to apply them. Previously the preferences field in the export was silently ignored.",
          "Fix: importing an activity CSV into a new project no longer trips the new conflict guards — the unconditional-add path is preserved via a typed escape-hatch.",
          "Fix: stale error state from a prior bad file pick is now cleared when a new file is selected, in both the project-bundle and activity-CSV import surfaces.",
        ],
      },
      {
        title: "Internal",
        items: [
          "New useImportState hook centralizes the import state machine (idle / error / preview / applying / done) with named transition helpers and reactive cloud-data-readiness guards. ImportSection is now a thin controlled view.",
          "Store action importProjects rewritten as a decision-based action returning ImportOutcome. Decisions carry kind ('id' | 'name') and originalExistingId for Layer 2 stale-data guards (the same Layer 2 protections that prevent silent data clobber when peers mutate the workspace between preview and confirm).",
          "Layer 2 drift guards symmetric across ID-conflict-replace and name-conflict-replace branches — if a target disappears AND a new collision appears, the project is added to outcome.driftSkipped rather than written.",
          "New cloudDataLoaded reactive store field, written at 7 sites in use-cloud-sync.ts (4 initial-load + 3 model-refresh) so peer-invitation refreshes re-validate any open preview.",
          "Applying-state observability uses flushSync + a setTimeout(0) macrotask yield so aria-busy commits to the DOM and the browser paints the spinner before the synchronous merge runs.",
          "Double-confirm protection via inFlightRef apply-active ref — closure-stale state guard alone is insufficient because rapid clicks can re-enter the same useCallback closure before React commits.",
        ],
      },
    ],
  },
  {
    version: "0.42.6",
    date: "2026-05-09",
    sections: [
      {
        title: "Security",
        items: [
          "H3 (paired app-code fix) — findUserByEmail in firestore-sharing.ts now passes limit(1) to the Firestore query. Pairs with the spertscheduler_profiles rule split (allow get + limit-bounded list). Both sides now hold the line independently. Closes the bulk profile-enumeration vector that allowed any signed-in user to harvest the entire Scheduler user roster (emails, displayNames, photoURLs) in a single getDocs(collection(...)) call.",
          "M1 — Runtime role validation in bulk-invite. BulkSharingSection.handleSend now refuses to call the sendInvitationEmail Cloud Function unless role is exactly 'editor' or 'viewer'. New isValidInviteRole type-guard helper in invitation-utils.ts. Defense-in-depth: TypeScript narrowing is erased at runtime, so a DOM/devtools modification of the <select> could otherwise feed any string to the CF.",
          "M2 — Worker simulation results discarded post-sign-out. New simulation-cancellation module exports a generation counter; useAutoRunSimulation and ProjectPage.handleRunSimulation capture the generation at dispatch and short-circuit if it doesn't match at result-time. Sign-out cleanup registry calls bumpSimulationGeneration() first. The worker is not terminated (terminating mid-run can leave the worker unrecoverable); discarding the result downstream is functionally equivalent and structurally safer.",
          "M3 — Auth-guarded beforeunload flush. useCloudSync.handleBeforeUnload now returns early when user is null. Closes a race where session expiry between handler registration and tab close would attempt a Firestore write with revoked credentials, silently swallowed.",
          "M4 — UID-namespaced localStorage keys. Project keys moved from spert:project:{id} to spert:project:{namespace}:{id} where namespace is 'local' for signed-out users and {uid} for cloud users. Cross-user data visibility is now a structural guarantee rather than procedural. Existing unscoped keys migrate to 'local' on module load using read → write-and-verify → delete ordering so a mid-migration crash leaves duplicate data, never lost data.",
          "M5 — Architectural-security-model comments. Added a SECURITY MODEL block above the spertsuite_invitations rule documenting that allow write: if false is the architectural backstop for the resend cap and emailSendCount tamper-proof guarantee. Mirrored the comment above BulkSharingSection.handleResend so v0.43.x's LegacySharingSection cleanup cannot accidentally remove the security-model documentation.",
        ],
      },
      {
        title: "Internal",
        items: [
          "New src/infrastructure/simulation/simulation-cancellation.ts module (5 unit tests).",
          "LocalStorageRepository API extended with optional namespace constructor argument; legacy-key migration runs once at module load (10 unit tests covering namespace switching, constructor override, migration, idempotency, ordering safety).",
          "isValidInviteRole type guard added to invitation-utils.ts (4 unit tests).",
          "findUserByEmail test added (2 tests verifying limit(1) is passed to the query and email normalization).",
          "Test count: 1310 → 1333 (+23 new security-fix tests).",
        ],
      },
    ],
  },
  {
    version: "0.42.5",
    date: "2026-05-09",
    sections: [
      {
        title: "Internal",
        items: [
          "Refactor pass — large-file decomposition along clean seams. ActivityEditModal.tsx (1193 → 893 LOC) sheds ScheduleContextRow, Section, DependenciesDisplaySection, ScheduleAnalysisSection, and the pure computeConstraintUpdates helper into a new activity-modal-sections.tsx. New activity-modal-sections.test.ts covers computeConstraintUpdates (7 tests).",
          "UnifiedActivityRow.tsx (801 → 691 LOC) sheds the pure tab-navigation helpers (constraintBadgeClass, constraintBadgeLabel, maxTabTarget, buildTabFieldOrder, handleOffOrderTabNav, getActivityRowIds, handleCrossRowTabNav, handleInRowTabNav) into a new unified-activity-helpers.ts. New unified-activity-helpers.test.ts covers all eight helpers in isolation (35 tests) — closing a coverage gap where keyboard-navigation logic was previously only exercised through full-row integration paths.",
          "schedule-export-service.ts (519 → 237 LOC) splits the orthogonal CSV and XLSX formatters into export-csv-formatter.ts (exportScheduleCsv) and export-xlsx-formatter.ts (exportScheduleXlsx, xlsxSanitize). The service module retains all shared builders (buildSummaryData, buildGridRows, buildPredecessorMap, buildSuccessorMap) and re-exports the formatters so existing imports — including schedule-export-service.test.ts — continue to work unchanged.",
          "No production behavior change. No dependency upgrades (every available upgrade was either inside the 60-day fresh-release window or required major-version owner approval).",
        ],
      },
    ],
  },
  {
    version: "0.42.4",
    date: "2026-05-08",
    sections: [
      {
        title: "Fixed",
        items: [
          "Invitation banner reload-loop on auto-fail. Effect 4's 30-second grace timer in useInvitationLanding transitioned to 'idle' without consuming the INVITE_SESSION_KEY first. After auto-fail, late spert:models-changed events gated on the key could re-fire the banner. The same hygiene now applies in dismiss(), so all three exit paths from pre_auth (claim-success in Effect 3, timeout in Effect 4, manual dismiss) consume the key symmetrically. (Lesson 59.)",
          "Post-send refresh in BulkSharingSection no longer fail-fast. After a successful bulk-invite send, the members-list and pending-invitations refreshes ran sequentially with await, so a transient rejection in the first blocked the second from updating. Now wrapped in Promise.allSettled so each list refreshes independently. Each callback already swallows its own errors, so no extra logging needed at the call site. (Lesson 64.)",
          "Members-fetch failures in BulkSharingSection now surface visibly. Previously the loadMembers catch silently swallowed errors — a transient Firestore failure left the list rendering empty with no signal to the user that anything went wrong. The boolean isOwner check is replaced with a four-state OwnerStatus enum (loading | owner | not-owner | error); the error state replaces the section's inner content with \"Couldn't load sharing details. Refresh the page to try again.\" while keeping the section header collapsible. Synchronous ownership derivation from project.owner (Lesson 38) is preserved; non-owners still see the members list (informational), only the bulk-invite form is owner-gated — matching pre-existing UX. (Lesson 60.)",
        ],
      },
    ],
  },
  {
    version: "0.42.3",
    date: "2026-05-07",
    sections: [
      {
        title: "Changed",
        items: [
          "Invitation banner restyled as a centered card. The pre-auth invitation prompt now renders as a max-w-lg (512px) centered card instead of a full-width banner spanning the page. The dismiss × is anchored to the card's top-right corner instead of floating ~800px from its content. A subtitle (\"Sign in to claim your invitation.\") clarifies the call-to-action below the headline. Visual hierarchy bumped to text-base font-semibold for the headline. Behavior — state machine, dismiss handler, ToS gate, mutual-exclusion with FirstRunBanner / LocalStorageWarningBanner — all unchanged.",
        ],
      },
    ],
  },
  {
    version: "0.42.2",
    date: "2026-05-07",
    sections: [
      {
        title: "Fixed",
        items: [
          "Invite-link landing now triggers the sign-in banner. Pasting https://scheduler.spertsuite.com/?invite=<token> into a fresh browser correctly captures the token and prompts Google/Microsoft sign-in. Previously the token was silently discarded because the router's index redirect (<Navigate to=\"/projects\" replace />) fired its useEffect deepest-first — stripping the query string before Layout's useInvitationLanding Effect 1 could read it. The URL capture now runs at module load (synchronously, before any React rendering), decoupling it from effect-ordering entirely. Effect 1 now owns only the React-state transition.",
        ],
      },
    ],
  },
  {
    version: "0.42.1",
    date: "2026-05-07",
    sections: [
      {
        title: "Fixed",
        items: [
          'Bulk-invite result chips now show the email. "✓ Added" and "✉ Invited" rows were rendering with the email missing because the client mistyped the Cloud Function\'s response — the CF returns string[] for added and invited, not {email, ...}[]. (✗ Failed rows were unaffected; that array type was already correct.)',
          'Sharing section width — Members list, bulk-invite form, and Pending invitations are now constrained to max-w-3xl (768px) instead of spanning the full project-page width. Eliminates the "controls floating off across the screen" effect on wide monitors. Applied to both the active BulkSharingSection and the dormant LegacySharingSection (rollback path) for consistency.',
        ],
      },
    ],
  },
  {
    version: "0.42.0",
    date: "2026-05-XX",
    sections: [
      {
        title: "Added",
        items: [
          "Bulk-sharing invitation system — project owners can paste multiple email addresses to invite collaborators at once. Existing SPERT Scheduler users are added to the project immediately; new users receive an invitation email and claim the project automatically when they sign in. Invitations carry editor or viewer roles. The Sharing section grows a textarea with comma/newline/semicolon-tolerant input, a role select, and chips listing the result of the call: ✓ Added, ✉ Invited, or ✗ Failed (reason).",
          "Pending invitation management. When invitations are outstanding, the Sharing section shows a list with a Resend button (capped at 5×) and a Revoke button (with confirmation dialog). The send-count display (N/5) greys out at the cap. Revoking removes the invitation immediately so the recipient can no longer claim it.",
          "Invite link landing flow. A user arriving at scheduler.spertsuite.com?invite=<token> sees a precedence banner that prompts sign-in and auto-switches to cloud storage if their local data is empty (Lesson 28: never wipe local projects). Once signed in, the invitation is claimed automatically and the banner shows the model names just unlocked. The token is stripped from the URL on capture so it never persists in browser history.",
          "Suite-wide profile collection. Every sign-in now writes a profile doc to spertsuite_profiles/{uid} in addition to the existing spertscheduler_profiles/{uid} doc — the bulk-invite Cloud Function reads the suite-wide collection to discover existing users across SPERT apps. No visible UX change.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Sharing section visible immediately on new and cloned projects (latent v0.41.0 regression — Lesson 38). Previously, after Add Project or Clone Project in cloud mode, the Sharing section was suppressed until a page reload because the in-memory Project carried no owner field. The store now seeds project.owner at create/clone time, the Firestore load paths re-attach _owner as owner, and the snapshot listener preserves the field after each Zod parse.",
          "AuthProvider callback restructure. setLoading(false) now fires unconditionally as the first statement of every onAuthStateChanged callback, eliminating a transient loading-stuck state on the ToS-stale sign-out path (the early-return previously skipped it). setUser(...) is now a single call site at the bottom of the callback. Defensive — the symptom was brief but real.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Profile writes now use updatedAt (server timestamp) instead of lastLogin. Existing Firestore docs retain the old field; new writes add the new one.",
          "Microsoft display names in 'Last, First' form are now normalized to 'First Last' at profile write time, not just at read time. The UI display was already normalized via getDisplayName; this changes the stored value.",
          "Member removal in the Sharing section now routes through FirestoreDriver.removeCollaborator (atomic transaction with three app-side guards) — same end state as the deleted removeProjectMember helper, simpler call surface.",
        ],
      },
      {
        title: "Internal",
        items: [
          "Feature gate. New INVITATIONS_ENABLED flag in src/app/featureFlags.ts. Ships flag-off in v0.42.0 and is flipped on in PR 3 (single-line change, no version bump — suite canonical pattern).",
          "Project.owner: string | null is now a required schema field. Zod default null covers existing local docs and import paths; addProject(name, owner) and cloneProject(sourceId, owner) take an explicit owner argument so the local/cloud decision is made at the call site.",
          "CSP adds https://*.run.app to connect-src for forward-compat with Cloud Functions Gen 2 routing through Cloud Run.",
          "useSignInWithTosGate hook consolidates the consent-gate state machine that was previously duplicated across StorageLoginModal and StorageModeSection. The new shared <SignInButtons /> and <AuthProviderLogos /> components eliminate the inline-SVG copies. <ConfirmDialog /> is a new Radix-based component.",
          "useInvitationLanding hook captures the invite token, runs the auto-flip-to-cloud logic, listens for spert:models-changed, and runs a 30-second grace timer. Lifted to Layout.tsx as the sole call site so the state machine is single-instance and state can gate the visibility of FirstRunBanner / LocalStorageWarningBanner (mutual exclusion).",
          "removeProjectMember and upsertUserProfile deleted from firestore-sharing.ts after their last call sites swapped over. shareProject and the legacy SharingSection variant are retained as the rollback safety net per Lesson 23 — scheduled for deletion in v0.43.x once v0.42.x ships stably.",
        ],
      },
    ],
  },
  {
    version: "0.41.0",
    date: "2026-05-04",
    sections: [
      {
        title: "Added",
        items: [
          'Clone Project from the Projects tab. Each project tile now carries a Clone button on its right-side action rail (between the drag handle and the archive button). Clicking it produces an immediate, fully-detached copy of the source project — every project, scenario, activity, dependency, milestone, checklist item, and deliverable item gets a freshly-minted ID via the same ID-remapping pipeline that already powered scenario cloning, so there is zero ID overlap between source and clone. The clone\'s name is `"{original} (Copy)"`, auto-incrementing to `(Copy 2)`, `(Copy 3)`… on collision against any existing project name (active or archived). Cloning an archived project produces an unarchived clone — the source is preserved unchanged. Cached Monte Carlo simulation results are dropped from every cloned scenario; users re-run the simulation on the clone (matches the cloud-sync stripping convention). All cosmetic state — tile color, target finish date, gantt appearance settings, holiday calendar override, converted work days, show-target-on-gantt, show-activity-IDs — survives the copy. Cloud sync uses the existing emitCreate path, so cloud-mode users see the new project appear in Firestore the moment they click.',
          "The clone workflow exists primarily to enable a debug-export use case: clone a real project, scrub the corporate names by hand, export the JSON, and share it as a reproducer for issues — without exposing client data. The toast confirmation surfaces the new project name so users know the clone landed.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Project tile color picker moved from the right-side action rail to immediately left of the project name, inline in the title row. The 4 px tile-color left border has always served as the visual indicator of the chosen color; placing the swatch picker next to the name makes it read like a category dot (Notion/Linear/GitHub-label style) and visually merges with the border accent. Moving the swatch off the right rail also frees vertical space for the new clone button without crowding the existing drag handle, archive, and delete controls. The popover now anchors to the left of the swatch and expands rightward (was right-anchored when the swatch lived on the right edge of the tile).",
        ],
      },
      {
        title: "Internal",
        items: [
          'New `cloneProject(source, newName)` exported from src/app/api/project-service.ts. Implementation reuses the existing `cloneScenario` per scenario rather than duplicating the ID-remap logic — every scenario inside the clone goes through the same pipeline that re-mints activity IDs, remaps dependency endpoints, remaps milestone references on activities, and re-generates the rngSeed. The project layer adds the cosmetic-state copy and the new `id`, `createdAt`, and `schemaVersion`. Calendar and gantt-appearance objects are shallow-copied (and `convertedWorkDays` / `globalCalendarOverride.holidays` arrays are spread) so the clone never aliases mutable references back to the source.',
          'New `cloneProject(sourceId)` action on the Zustand store. Mirrors `addProject` for persistence — `repo.save(clone)` followed by `cloudSyncBus.emitCreate(clone.id)` — and returns the new project so the caller can navigate or toast on it. A module-scoped `nextCloneName(base, existing)` helper computes the collision-safe name; capped at "(Copy 99)" with a timestamp fallback that should never trigger in practice.',
          'ProjectTile gained an optional `onClone` prop and a paired clone button SVG (two overlapping rectangles, blue hover). The TileColorPicker JSX moved from the right-rail flex column into the title-row flex container, before the `<h2>`. No prop signature changes for tile-color handling — `onChangeTileColor` still optional, still scoped to the tile. ProjectsPage wires the new action through a `handleClone(id)` callback that calls the store and emits a `toast.success("Cloned to \\"{name}\\"")` on success.',
          'Schema version unchanged (still v20). Cloning is a runtime-only ID-remap operation; nothing about the persisted project shape changed. No migration written, no Zod schema bumped, no Firestore rule field added.',
        ],
      },
    ],
  },
  {
    version: "0.40.4",
    date: "2026-05-03",
    sections: [
      {
        title: "Fixed",
        items: [
          "Comprehensive form-field hygiene sweep across the entire UI. Chrome's DevTools Issues panel previously surfaced ~50 form-related warnings spanning four rule classes — autocomplete attribute valid value, Form field element should have an id or name attribute, No label associated with a form field, and orphan <label> elements with no associated control. Almost every <input>, <textarea>, and <select> in the codebase now carries a stable, semantic name attribute (camelCase: projectName, activityName, estimateMin, confidenceLevel, ganttShowToday, etc.). Every separate <label> is now paired with its control via htmlFor + id generated by React's useId() (no hardcoded ids, collision-free across modal instances and list rows). Implicit-wrap labels (input as label child) were left unchanged where already valid. Display-only <label> elements that were labeling read-only <p> text — and section headings that visually looked like labels but didn't associate with a single control — were converted to <div>/<span> to remove the orphan-label warning without changing visual presentation.",
          "Adjacent accessibility fixes done in passing on elements already being touched. ToggleSwitch (a <button role=\"switch\">) now accepts an optional ariaLabel prop and the seven existing usages pass meaningful labels (Dependency mode, Parkinson's Law, Heuristic estimation enabled, Enable Dependencies/Heuristic/Parkinson by Default, Warn on startup when using local storage). The Constraint Mode radio group in ActivityEditModal now has role=\"group\" + aria-label. Activity-row select/input elements gained aria-label to disambiguate per-row controls that share names across rows.",
        ],
      },
      {
        title: "Internal",
        items: [
          'Two shared wrappers extended with optional accessibility props (non-breaking). InlineEdit accepts name (default "inlineEdit") and optional ariaLabel (defaults to placeholder text); the two callers in ScenarioTabs and ProjectPage now pass meaningful values. EstimateInputs automatically derives name from each estimate field\'s dataField (estimate-min / estimate-ml / estimate-max) and adds aria-label from the field title. ConfidenceLevelSelect\'s internal filter input gained name="confidenceLevelFilter", autoComplete="off", and aria-label="Filter confidence levels".',
          "name reuse is intentional in repeated-row contexts (activity rows, milestone rows, holiday-edit rows, dependency rows). None of these inputs coexist inside the same real <form> element — Chrome's \"id or name\" rule is satisfied by the presence of name regardless of duplication, and the per-row aria-label provides a unique accessible name for each instance.",
          "No behavior changes, no new files, no test changes — purely additive prop wiring and label association. Schema, migrations, Firestore rules, simulation logic, and visual styling all unchanged. Typecheck and lint baseline (15 errors / 1 warning) hold; 1221 tests pass across 59 files.",
        ],
      },
    ],
  },
  {
    version: "0.40.3",
    date: "2026-05-03",
    sections: [
      {
        title: "Fixed",
        items: [
          'Cloud project create and delete failures are now surfaced to the user via toast. v0.40.2 wired onSaveError for the debounced save path, but the driver.create(...) and driver.remove(...) call sites in useCloudSync are direct one-shot calls whose .catch handlers logged to the console only. A failed project create or delete in cloud mode therefore left the user unaware that their action did not persist. Both .catch handlers now also emit toast.error("Cloud sync error — changes may not have saved. Check your connection."), the same copy used by the existing save-failure toast — consistent messaging is the right call for a patch; per-error-type nuance is a future UX decision.',
        ],
      },
    ],
  },
  {
    version: "0.40.2",
    date: "2026-05-03",
    sections: [
      {
        title: "Fixed",
        items: [
          'Cloud sync write failures are now surfaced to the user via toast. FirestoreDriver already exposed an onSaveError(cb) hook that fires for every write failure (doSave, create, saveImmediate, savePreferences), but useCloudSync never wired a callback after constructing the driver, so errors were swallowed (logged to the console only). The hook now installs a callback immediately after new FirestoreDriver(user.uid) that emits toast.error("Cloud sync error — changes may not have saved. Check your connection.") on every write failure. The toast is intentionally not debounced or deduplicated at this layer; doSave is already debounced 500 ms and write errors should only surface during genuine connectivity loss.',
          "Real-time project listeners no longer die silently on permanent failures. subscribeToProject previously called onSnapshot with only the success callback, so if a listener failed permanently (PERMISSION_DENIED, network cut, project deleted by another user), the Firebase SDK silently stopped delivering events with no app-level notification. The method now accepts an optional onError?: (error: unknown) => void parameter and passes it as the snapshot listener's error handler. The signature change is backward-compatible — the existing single-callback call signature continues to work without modification. useCloudSync.addProjectListener now passes an error handler that logs the failure and removes the project ID from listenedIdsRef, allowing future calls to addProjectListener to re-subscribe (note: nothing currently triggers resubscription for existing projects — a full reconnect mechanism is deferred and is documented inline).",
        ],
      },
      {
        title: "Internal",
        items: [
          'Added missing autoComplete attributes to two form inputs. The type="email" member-invite input in SharingSection.tsx was the only input in the codebase producing an active browser autofill warning; it now carries autoComplete="off" because it accepts another user\'s email (sharing/lookup), not the signed-in user\'s own email. The "Search projects..." text input in ProjectsPage.tsx also gained autoComplete="off" as preemptive hygiene — the input has no id or name attribute today, so the browser does not currently warn for it, but search/filter fields should always opt out of autofill regardless. No other inputs needed changes: placeholder="Locale", placeholder="Milestone name", placeholder="My Project", and similar app-domain fields are not personal-data fields and are correctly excluded from the audit.',
        ],
      },
    ],
  },
  {
    version: "0.40.1",
    date: "2026-04-30",
    sections: [
      {
        title: "Added",
        items: [
          "Browser tab favicon and apple-touch-icon. Previously the app shipped with no favicon link in index.html, so browser tabs and bookmarks displayed the default blank/globe icon. The new SPERT mark (192×192 PNG with transparent rounded corners) now appears in the tab strip, bookmarks, and iOS home-screen shortcuts.",
          "Inline SPERT icon in the top-nav header. The 28×28 mark now sits to the left of the \"SPERT® Scheduler\" wordmark in Layout.tsx, vertically centered inside the existing brand <Link>. The icon is served from /public via a plain <img> tag (no module import or build hashing) and uses width/height attributes to reserve layout space and prevent CLS.",
        ],
      },
      {
        title: "Internal",
        items: [
          "Added public/spert-favicon-scheduler.png (192×192) and public/favicon.ico (32×32, PNG-format fallback). The .ico ships PNG bytes rather than a true ICO container — modern browsers accept this universally and it keeps the file at ~1.2KB versus the ~285KB true-ICO output from the npx png-to-ico build path. CSP is unaffected (img-src 'self' already permits the new asset). No PWA manifest added.",
        ],
      },
    ],
  },
  {
    version: "0.40.0",
    date: "2026-04-30",
    sections: [
      {
        title: "Changed",
        items: [
          "Editing scenario notes now collapses into a single undo entry per editing session. Previously each keystroke pushed its own snapshot, so a sentence-long note consumed dozens of slots from the 50-entry undo stack and required dozens of Ctrl+Z presses to revert. Notes editing now produces exactly one undo entry from focus through blur, restoring the textarea to its pre-edit state with a single Ctrl+Z. Pressing Ctrl+Z mid-edit and continuing to type re-establishes the group cleanly so the post-undo edits also collapse to a single entry.",
        ],
      },
      {
        title: "Internal",
        items: [
          "Added commit-based undo grouping primitive to the project store: module-scoped activeUndoGroup state, a project-id-scoped guard at the top of pushUndo, and two new actions (beginUndoGroup / endUndoGroup) wired to scenario-notes textarea onFocus/onBlur. The defensive onChange wrapper at the ProjectPage layer also calls beginUndoGroup, making the group self-heal after a mid-edit undo()/redo(). undo() and redo() close any active group before popping; setProjects and clearAllData null the group on session boundaries.",
          "Three new test cases in use-project-store.test.ts cover the grouping mechanism: single-entry collapse across repeated updates, cross-project mutations not suppressed, and group self-heal after mid-edit undo (1221 tests passing across 59 files).",
        ],
      },
    ],
  },
  {
    version: "0.39.1",
    date: "2026-04-23",
    sections: [
      {
        title: "Fixed",
        items: [
          "Settings → Cloud Storage radios appearing unchecked after opening then dismissing the auth-chip modal. The modal's radio group shared name=\"storage-mode\" with StorageModeSection, so the browser treated all four radios as a single native group. When the modal rendered and then closed, the Settings page's radios were left visually unchecked even though React state was unchanged. Renamed the modal's radios to name=\"storage-mode-modal\" to keep the two groups isolated.",
        ],
      },
    ],
  },
  {
    version: "0.39.0",
    date: "2026-04-23",
    sections: [
      {
        title: "Changed",
        items: [
          "Standardized auth chip click behavior across all three states (signed-out, signed-in-local, signed-in-cloud). Every click now opens the Storage & Sign In modal — the previous inline popover for signed-in states (with Switch to Cloud Storage and Sign out buttons) has been removed. Modal open state now lives at the Layout level rather than inside AuthButton.",
          "Storage & Sign In modal now handles all three auth/storage combinations in-place. After successful sign-in the modal no longer auto-closes and navigates to /settings; instead it transitions to the signed-in-local layout so the user can flip to Cloud Storage without leaving the modal. Signed-in states show an identity card with avatar, display name (Microsoft 'Last, First MI' reversed to 'First MI Last' via the new getDisplayName helper), email, and inline Sign out. Radio group is interactive when signed-in: selecting Cloud triggers the upload-confirm/migration flow, selecting Local triggers the Keep/Discard confirmation.",
          "Modal now includes an always-visible Notifications section with the Warn me on startup when using local storage toggle — a second entry point to the same preference already in Settings → Notifications. Both surfaces read and write the same suppressLocalStorageWarning preference (intentionally left cloud-synced alongside the rest of UserPreferences; not migrated to a local-only key).",
          "Sign-in button row now wraps (flex-wrap) below ~320px viewports instead of overflowing. Modal gains an explicit × close button in the title row (backdrop, Escape, and the dismiss text button continue to work)."
        ],
      },
      {
        title: "Internal",
        items: [
          "Extracted src/ui/hooks/use-storage-mode-switch.ts — shared state machine for migration progress, migration result/error, and the Keep/Discard confirmation flow. Consumed by both StorageLoginModal (new) and StorageModeSection (settings page). Eliminates drift risk between the two mode-switch entry points.",
          "Added getDisplayName() to src/ui/helpers/format-user.ts alongside the existing getFirstName() — reverses Microsoft 'Last, First MI' display names to natural 'First MI Last' order for the identity card. getFirstName semantics unchanged.",
          "Removed openedWhileSignedOutRef + post-sign-in auto-navigate effect from StorageLoginModal. Signed-in vs signed-out layout is now pure state-driven off the {user, mode} tuple.",
          "Settings → Cloud Storage section retained as a secondary entry point; refactored to consume the shared hook. Settings → Notifications section retained — two entry points to the same toggle is intentional."
        ],
      },
    ],
  },
  {
    version: "0.38.6",
    date: "2026-04-23",
    sections: [
      {
        title: "Internal",
        items: [
          "Lint debt paydown: eliminated all 48 sonarjs/no-nested-conditional errors and reduced sonarjs/cognitive-complexity errors from 26 to 14 across 24 files. Total lint errors: 74 → 15 (plus one cosmetic warning). Batched three coordinated PRs (B2-a → B1 → B2-b) into a single release because the changes have cross-plan code coupling and zero user-visible behavior.",
          "B2-a — Pure-logic complexity reduction (5 CC errors). use-milestone-buffers.ts: two-level extraction of computeMilestoneSlack + computeSingleMilestoneInfo with a MilestoneComputeContext param object. build-simulation-params.ts: extracted resolveConstraintOffsets (DRYs the constraint-resolution loop across sequential and dependency modes). gantt-utils.ts: replaced generateTicks's 7-branch if/else if chain with a TICK_GENERATORS dispatch table + 7 per-level generator functions — bit-identical output. local-storage-repository.ts: loadWithDiagnostics restructured as a flat chain over a PhaseResult<T> discriminated union with four focused helpers. firestore-driver.ts: extracted processProjectDoc as a private method, documented the write-forward side-effect in JSDoc.",
          "B1 — Nested-ternary elimination (48 errors across 20 files). Added shared milestone-health helpers to src/domain/helpers/format-labels.ts: MilestoneHealth type + computeMilestoneHealth, milestoneHealthDotClass, milestoneHealthTextClass, milestoneHealthLabel. Applied three fix patterns: Pattern A (if/return helpers or let + if/else if for 3+ branch selectors — const hoisting does not clear this rule), Pattern B (pickBestHighlight generic for .map() data-shape producers), Pattern C (early-null-return formatters for outer-null-guards wrapping inner ternaries). firebase.ts rewrite preserves local-only-mode contract (initializeApp now only called when isFirebaseConfigured is true). GanttChart.tsx and PrintGanttChart.tsx edited in one commit to preserve print parity. Interim CC reduction side-effect: 22 → 17 (B1's helper extractions dropped 5 CC errors as a bonus).",
          "B2-b — UI complexity reduction (3 CC errors; plan expected 4 but ScenarioTabs already cleared by B1's let tabTitle extraction). UnifiedActivityRow.tsx handleTabNav (CC 33 after B1's partial reduction): extracted 5 helpers — buildTabFieldOrder, handleOffOrderTabNav, getActivityRowIds, handleCrossRowTabNav, handleInRowTabNav. use-gantt-layout.ts and PrintGanttChart.tsx tick suppression: extracted shared suppressOverlappingTicks + shouldSuppressTick + TickSuppressionParams interface to gantt-utils.ts. Both call sites now collapse to a single-line memoized call; raw layout primitives pass through the param object rather than a callback to preserve per-param memoization stability. Dead inline consts deleted post-refactor.",
          "Known cosmetic lint warning: PrintGanttChart.tsx:165 retains an eslint-disable-next-line react-hooks/preserve-manual-memoization directive that currently reports as \"unused\" because the rule is dormant in this project's ESLint config. Preserved intentionally for future-proofing. The // NOSONAR comment on the same line is load-bearing and independent.",
          "No behavior change. All 1218 tests pass; typecheck clean.",
        ],
      },
    ],
  },
  {
    version: "0.38.5",
    date: "2026-04-23",
    sections: [
      {
        title: "Internal",
        items: [
          "Flattened cognitive complexity in the dependency graph and milestone simulation parameter builder (PR 3 of the three-PR lint-debt paydown plan). All five sonarjs/cognitive-complexity errors in src/core/schedule/dependency-graph.ts (CC 16, 36, 17, 21) and src/core/schedule/milestone-sim-params.ts (CC 17) brought under the 15-allowed threshold. Lint count: 79 → 74 errors (0 warnings).",
          "dependency-graph.ts: extracted populateAdjacency + kahnTopoSort from buildDependencyGraph; extracted buildAdjacencyForCycle, reconstructCyclePath, and findCycleFrom (single-DFS-tree visitor) from detectCycle; extracted validateDepStructure from validateDependencies; introduced shared runForwardPass / runBackwardPass primitives now reused by both computeCriticalPathDuration and computeCriticalPathActivities; extracted computeActivityScheduleWithMilestone, applyHardConstraintIfPresent, and computeMilestoneDurations from computeCriticalPathWithMilestones.",
          "milestone-sim-params.ts: extracted snapForwardToWorkingDay (shared by project-start and milestone-target snapping), buildMilestoneActivityMap, and computeActivityEarliestStartOffset from buildMilestoneSimParams.",
          "stryker.config.mjs + vitest.stryker.config.ts: added milestone-sim-params.ts (and its test file) to the Stryker mutate scope so future refactors of that file have a baseline to compare against. Caught a latent gap during the baseline run — the file had no mutation coverage before this PR.",
          "Verified by Stryker mutation re-run against the pre-refactor baseline: dependency-graph.ts mutation score 89.13% → 89.27% (survivors 20 → 19); milestone-sim-params.ts survivor count unchanged (8 → 8). The headline percentage drop on milestone-sim-params (80.00% → 77.78%) comes entirely from the extracted helpers producing more type-checker-rejected mutants, not new test gaps.",
          "No behavior change. All 1218 tests pass; typecheck clean.",
        ],
      },
    ],
  },
  {
    version: "0.38.4",
    date: "2026-04-21",
    sections: [
      {
        title: "Internal",
        items: [
          "Flattened nested-function depth in the Zustand project and notification stores (PR 2 of the three-PR lint-debt paydown plan). All 10 sonarjs/no-nested-functions errors resolved. Lint count: 89 → 79 errors (0 warnings).",
          "Added four module-level helpers to use-project-store.ts: updateProjectInList(projects, projectId, transform), updateScenarioInList(projects, projectId, scenarioId, mutation), patchActivityInList(activities, activityId, patch), and filterOut(arr, value). Each is a plain function that takes its callback as a parameter, so inlining them at call sites no longer counts as a nested function definition.",
          "Rewrote 9 store actions (addActivity, duplicateActivity, updateActivityChecklist, updateActivityDeliverables, updateActivityNotes, updateScenarioNotes, setSimulationResults, removeConvertedWorkDay, toggleScenarioLock) to use these helpers. Each action went from 5 nested arrow levels to 3.",
          "use-notification-store.ts: extracted the filter predicate into a module-level removeFromList(notifications, id) helper shared by both addNotification's auto-dismiss setTimeout and the explicit removeNotification action.",
          "No behavior change. All 1218 tests pass; undo/redo, activity mutations, and notification dismissal are observationally identical.",
        ],
      },
    ],
  },
  {
    version: "0.38.3",
    date: "2026-04-21",
    sections: [
      {
        title: "Internal",
        items: [
          "Eliminated all four ESLint warnings and three errors from the pre-existing lint baseline (PR 1 of a three-PR lint-debt paydown plan). Lint count: 96 → 89 problems (92 errors + 4 warnings → 89 errors + 0 warnings). Two of the warnings were real React correctness signals, not stylistic.",
          "ScenarioSummaryCard.tsx: eliminated double-render on heuristic %-input prop changes. The two useState + useEffect pairs that synced localMinPct/localMaxPct to settings.heuristic{Min,Max}Percent triggered react-hooks/set-state-in-effect warnings and caused a second render after every scenario switch or undo/redo. Replaced with React's documented 'adjust state during render' pattern (useState for previous prop + if (prev !== current) setPrev(current); setLocal(...)), which commits a single render per prop change.",
          "SimulationPanel.tsx: restored React Compiler optimization of the targetLookup useMemo. The manual dep list listed simulationResults?.samples (a narrower shape than the React Compiler's inferred simulationResults), which tripped react-hooks/preserve-manual-memoization and prevented compiler-driven optimization. Broadened the dep to the full simulationResults object; the memoized body already null-guards simulationResults?.samples?.length. Also extracted the inline color ternary into a healthColor() helper and pre-computed the ' by {dateLabel}' suffix to eliminate the adjacent SonarJS no-nested-conditional and no-nested-template-literals errors.",
          "ThemeToggleButton.tsx: restored fast-refresh HMR. The file exported a non-component nextTheme helper alongside the component, which tripped react-refresh/only-export-components and disabled HMR for the file. Dropped the export keyword; nextTheme is used only internally.",
          "eslint.config.js: added coverage/ to the ignores list. The auto-generated Istanbul coverage output (coverage/block-navigation.js) was surfacing an Unused eslint-disable directive warning on every lint run.",
        ],
      },
    ],
  },
  {
    version: "0.38.2",
    date: "2026-04-21",
    sections: [
      {
        title: "Fixed",
        items: [
          "Printed PDF report no longer shows a misleading Confidence label for Triangular and Uniform activities. The Statistical PERT Ratio Scale Modifier (RSM) only drives the proxy standard deviation for Normal and LogNormal distributions; Triangular and Uniform activities ignore the stored confidenceLevel. The interactive grid already greys the cell out, and the XLSX/CSV schedule exports already write an empty cell for these distributions, but the printed report rendered the confidence label unconditionally for every row. The print path now mirrors the same distributionType guard used by the export pipeline, falling back to an em-dash (—) — the standard N/A sentinel elsewhere in the printed report — for non-SPERT distributions.",
        ],
      },
    ],
  },
  {
    version: "0.38.1",
    date: "2026-04-20",
    sections: [
      {
        title: "Fixed",
        items: [
          "Scenario tab row now scrolls horizontally with a standard mouse wheel on Windows. Chromium-family browsers do not translate vertical wheel events to horizontal scroll on containers whose only overflow axis is X, so users with many scenarios had to use Shift+Wheel or click a partially-visible tab. A scoped native wheel listener now redirects deltaY into scrollLeft when the container overflows and the event has no horizontal component. Trackpad two-finger horizontal gestures (which carry deltaX) are passed through unchanged. Firefox's line-mode deltas are converted to pixels.",
        ],
      },
    ],
  },
  {
    version: "0.38.0",
    date: "2026-04-19",
    sections: [
      {
        title: "Security",
        items: [
          "Sign-out now fully wipes per-user session data. Previously, after signing out of Cloud Storage, the prior user's projects, preferences, and last-active scenario map remained in both the in-memory store and localStorage. On a shared browser, the next user could see the prior user's data and — in rare cases — inadvertently upload it to their own Firestore account. Sign-out now cancels pending Firestore writes, zeros the Zustand project store, and clears spert:project:*, spert:project-index, spert:user-preferences, and spert-scheduler:active-scenarios. Storage mode (spert:storage-mode), first-run banner state, and the Nager country cache are intentionally preserved for continuity.",
          "Sign-out during an edit no longer races revoked credentials. The Firestore driver now cancels queued 500 ms-debounced writes before firebaseSignOut, so pending writes cannot fire against revoked credentials. beforeunload still flushes — tab-close semantics are unchanged.",
          "ToS-mismatch forced sign-out now routes through the same cleanup as user-initiated sign-out, so both paths cannot drift.",
          "ToS acceptance write failures no longer strand the user. When the Firestore write to users/{uid} fails, LS_TOS_WRITE_PENDING is now left set and LS_TOS_ACCEPTED_VERSION is unset, so the next sign-in retries and creates the missing record. Previously the local flags were finalized unconditionally, which could leave the user marked accepted locally but missing from Firestore — causing cross-app re-prompts.",
        ],
      },
      {
        title: "Added",
        items: [
          "Auth chip now has a 'signed-in + local' state. When you are signed in but using Local Storage, the chip shows your avatar + lock icon and opens a popover with two actions: 'Switch to Cloud Storage' (navigates to Settings — does not auto-switch) and 'Sign Out'. Previously the chip rendered 'Local only / Sign in' to already-signed-in users, with no way to sign out from the header.",
          "Cloud → Local mode switch now prompts. When toggling off Cloud Storage with projects present, a confirmation modal offers 'Keep local copy' (default) or 'Discard'. Discard clears spert:project:*, spert:project-index, spert-scheduler:active-scenarios, and zeros the in-memory store. Preferences are preserved — you're still the same person.",
          "OAuth popup errors are now differentiated. Closing the popup or double-clicking Sign In is a silent no-op — the page no longer redirects away. Popup-blocker browsers still fall back to a redirect and now show an explanatory toast before navigating. Other errors surface a 'Sign-in failed' toast.",
          "After a successful sign-in from the header chip's modal, the modal closes and the app navigates to /settings so you can immediately toggle Cloud Storage with one click. Previously the modal stayed open with no guidance.",
          "Shared getFirstName() helper for rendering user names with Microsoft 'Last, First' reversal. Used by the auth chip (both signed-in states) and the SharingSection member list — no more duplicated comma-parsing logic.",
        ],
      },
    ],
  },
  {
    version: "0.37.4",
    date: "2026-04-17",
    sections: [
      {
        title: "Added",
        items: [
          "Gantt chart now auto-draws finish-to-start arrows between adjacent activities when Dependency Mode is OFF. This makes the implicit sequential ordering visually explicit. The existing Arrows toolbar checkbox now also appears in non-dependency mode so you can hide the auto-drawn arrows if they aren't useful. Auto-drawn arrows are non-interactive and do not carry critical-path styling — in sequential mode every activity is trivially on the critical path, so the stripe would add no information.",
        ],
      },
    ],
  },
  {
    version: "0.37.3",
    date: "2026-04-16",
    sections: [
      {
        title: "Fixed",
        items: [
          "Header title and navigation tabs (Projects, Calendar, Settings, About) now use an inline-flex layout, working around a Chromium 147 rendering regression that caused the pointer-cursor affordance to disappear (and in Brave, clicks to miss the center of nav tabs). The workaround is harmless on unaffected browsers.",
        ],
      },
    ],
  },
  {
    version: "0.37.2",
    date: "2026-04-16",
    sections: [
      {
        title: "Fixed",
        items: [
          "Header buttons (theme toggle, cloud auth chip) now show the pointing-finger cursor on hover. This restores the click affordance that was lost with the Tailwind v4 upgrade, which removed the default `cursor: pointer` on `<button>` elements.",
          "Header title 'SPERT® Scheduler' is now fully clickable across its entire width at any viewport size — previously the title could wrap on narrow viewports, leaving the second line outside the hit target.",
          "Navigation links (Projects, Calendar, Settings, About) now explicitly declare the pointing-finger cursor and no-wrap behavior, so the click target stays consistent across browsers including Brave.",
        ],
      },
    ],
  },
  {
    version: "0.37.1",
    date: "2026-04-16",
    sections: [
      {
        title: "Fixed",
        items: [
          "Scenario tab row: hid the horizontal scrollbar that was rendering as a thick gray bar over the tab underline. Scrolling still works via drag, wheel, and keyboard; overflow is now signaled by partially-visible tabs at the edge.",
        ],
      },
    ],
  },
  {
    version: "0.37.0",
    date: "2026-04-16",
    sections: [
      {
        title: "Added",
        items: [
          "Scenario tabs now scroll horizontally when there are more scenarios than fit. The Compare button stays pinned on the right edge and is always visible.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Cloning a scenario now inserts the new clone immediately to the left of the source scenario, instead of appending to the end. Cloning from the '+' Add dialog follows the same placement rule. The clone becomes the active scenario and is auto-scrolled into view if off-screen.",
        ],
      },
    ],
  },
  {
    version: "0.36.4",
    date: "2026-04-10",
    sections: [
      {
        title: "Improved",
        items: [
          "Sign-in modal buttons now show Google and Microsoft brand icons.",
        ],
      },
    ],
  },
  {
    version: "0.36.3",
    date: "2026-04-10",
    sections: [
      {
        title: "Added",
        items: [
          "Sign-in modal when clicking the auth chip. Opens a focused dialog with Google and Microsoft sign-in buttons instead of navigating to the Settings page.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Horizontal layout shift caused by the scrollbar appearing and disappearing when navigating between pages of different heights.",
        ],
      },
    ],
  },
  {
    version: "0.36.2",
    date: "2026-04-09",
    sections: [
      {
        title: "Changed",
        items: [
          "Auth chip in the header is now a single clickable pill. When signed in to cloud storage, clicking anywhere on the chip opens a small account menu showing your name and email, with a Sign Out button. Dismiss with Escape or by clicking outside. When signed out, clicking the chip still opens the sign-in flow.",
        ],
      },
    ],
  },
  {
    version: "0.36.1",
    date: "2026-04-08",
    sections: [
      {
        title: "Fixed",
        items: [
          "Dependency edit modal: negative lag (lead time) values like \u201C-5\u201D can now be entered reliably. The Lag Days field auto-selects its current value on focus and accepts the minus sign as you type. Out-of-range values are clamped to \u00B1365 days on save.",
        ],
      },
    ],
  },
  {
    version: "0.36.0",
    date: "2026-04-08",
    sections: [
      {
        title: "Added",
        items: [
          "Theme toggle button in the header (between About and the cloud storage chip). Click to cycle Light \u2192 Dark \u2192 System; the icon reflects the current state.",
          "Per-project tile color: pick one of 8 muted accent colors (Slate, Sage, Sky, Lavender, Rose, Amber, Teal, Clay) to color-code projects on the Projects page \u2014 useful for grouping projects that belong to the same program. The color shows as a 4px left border strip on the tile.",
          "Import Projects button on the Projects page header (next to Export All Projects). Matches the header layout used by other SPERT Suite apps.",
        ],
      },
    ],
  },
  {
    version: "0.35.0",
    date: "2026-04-05",
    sections: [
      {
        title: "Legal",
        items: [
          "Updated Terms of Service and Privacy Policy to v04-05-2026.",
          "Added SPERT\u00AE AHP to list of covered apps.",
          "Updated effective date to April 5, 2026.",
        ],
      },
    ],
  },
  {
    version: "0.34.9",
    date: "2026-04-05",
    sections: [
      {
        title: "Improved",
        items: [
          "Header auth chip: replaced the text-button sign-in and avatar dropdown with the SPERT Suite split-pill design. Signed-in shows avatar + first name + cloud icon; local/signed-out shows lock + \"Local only\" + \"Sign in\".",
        ],
      },
    ],
  },
  {
    version: "0.34.8",
    date: "2026-04-03",
    sections: [
      {
        title: "Improved",
        items: [
          "Activity grid: the delete (×) button is now gray at rest and turns red only on hover, reducing visual clutter while preserving discoverability.",
        ],
      },
    ],
  },
  {
    version: "0.34.7",
    date: "2026-04-02",
    sections: [
      {
        title: "Added",
        items: [
          "Projects page: new \"Export All Projects\" button exports all active projects in one click (same JSON format as the Settings export, simulation results excluded).",
          "localStorage warning banner: an amber caution banner now appears on every page when your data is stored locally, reminding you to export at the end of each session. Dismiss with \"Got it\" for the session.",
          "Settings → Notifications: new toggle to permanently suppress the localStorage warning banner.",
        ],
      },
      {
        title: "Improved",
        items: [
          "Settings page: \"Schedule Export\" section renamed to \"Export Schedule\" for consistency with action-first labeling.",
        ],
      },
    ],
  },
  {
    version: "0.34.6",
    date: "2026-04-02",
    sections: [
      {
        title: "Improved",
        items: [
          "Gantt: finish date bar labels are now right-aligned inside the bar, anchoring the date visually to the bar's right (finish) edge instead of floating at center.",
        ],
      },
    ],
  },
  {
    version: "0.34.5",
    date: "2026-04-01",
    sections: [
      {
        title: "Security",
        items: [
          "XLSX export now guards against Excel formula injection (cells starting with =, +, -, @, tab, or carriage return are prefixed), matching the existing CSV export protection.",
          "CSV/clipboard import pipeline: individual cell values are now capped at 1,000 characters before processing, and error messages truncate echoed user values to 80 characters.",
          "Import parsing stops early once the 500-activity limit is reached, avoiding unnecessary processing of oversized files.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Min, Most Likely, and Max summary totals are now rounded to the nearest whole number in the activity grid and schedule exports (XLSX and CSV).",
        ],
      },
    ],
  },
  {
    version: "0.34.4",
    date: "2026-04-01",
    sections: [
      {
        title: "Maintenance",
        items: [
          "Internal refactoring: extracted useScheduleExport hook, ActivityEditModal sub-components, and SonarJS remediation helpers for improved maintainability.",
        ],
      },
    ],
  },
  {
    version: "0.34.3",
    date: "2026-04-01",
    sections: [
      {
        title: "Improved",
        items: [
          "Activity grid: hover over any row to reveal a pencil icon in the name cell that opens the Edit Activity modal directly.",
          "Min/ML/Max estimate columns narrowed (42px → 38px) and Status/Actual columns trimmed for a more compact layout.",
          "Estimate values (Min/ML/Max) are displayed as integers in the grid; decimals are accepted during entry and rounded on save.",
        ],
      },
    ],
  },
  {
    version: "0.34.2",
    date: "2026-04-01",
    sections: [
      {
        title: "Added",
        items: [
          "Activities with notes now show a small violet indicator beneath the activity name in the grid (alongside the existing task and deliverable bars), and a violet dot on the Notes section header in the Edit Activity modal.",
        ],
      },
    ],
  },
  {
    version: "0.34.1",
    date: "2026-04-01",
    sections: [
      {
        title: "Changed",
        items: [
          "Any scenario can now be deleted. The last remaining scenario is protected from deletion instead of the first (Baseline) scenario.",
        ],
      },
    ],
  },
  {
    version: "0.34.0",
    date: "2026-03-31",
    sections: [
      {
        title: "Added",
        items: [
          "CDF date probability lookup: enter a target finish date above the Cumulative Distribution chart to see the probability of finishing by that date, with a RAG-colored reference line (green/amber/red based on Schedule Health thresholds).",
          "Scheduled Start date now displayed in the Edit Activity modal alongside Scheduled Finish and Duration.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "CDF chart x-axis changed from categorical to numeric scale, producing a true CDF curve shape instead of a straight line.",
          "CDF chart resolution increased from 500 to 1,000 downsampled points for better tail accuracy.",
          "Edit Activity modal no longer falsely reports unsaved changes when opened and closed without modifications.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Edit Activity modal: duration labels abbreviated to \"Sched. Dur.\" and \"Actual Dur.\" for better layout at Complete status.",
        ],
      },
    ],
  },
  {
    version: "0.33.8",
    date: "2026-03-31",
    sections: [
      {
        title: "Maintenance",
        items: [
          "Updated Terms of Service and Privacy Policy to v03-31-2026.",
          "Updated canonical legal document URLs to spertsuite.com.",
          "Updated consent UI text to SPERT® Suite branding.",
        ],
      },
    ],
  },
  {
    version: "0.33.7",
    date: "2026-03-29",
    sections: [
      {
        title: "Fixed",
        items: [
          "CDF chart probability capped at 99%. The cumulative distribution tooltip previously displayed \"Probability: 100%\" at the rightmost data point, implying certainty that the project cannot exceed the maximum simulated duration. Monte Carlo samples are finite — the true distribution tail always extends beyond the observed maximum.",
        ],
      },
    ],
  },
  {
    version: "0.33.6",
    date: "2026-03-29",
    sections: [
      {
        title: "Fixed",
        items: [
          "Web Worker trial count validation ceiling raised from 50,000 to 100,000 to match the Zod schema and UI options introduced in v0.33.5. Previously, selecting 100,000 trials caused a worker validation error.",
        ],
      },
    ],
  },
  {
    version: "0.33.5",
    date: "2026-03-29",
    sections: [
      {
        title: "Added",
        items: [
          "Monte Carlo simulation trial count option: 100,000 trials now available in both the scenario settings and default preferences dropdowns. Useful for audit-grade precision where reduced variance is needed.",
        ],
      },
    ],
  },
  {
    version: "0.33.4",
    date: "2026-03-29",
    sections: [
      {
        title: "Added",
        items: [
          "Gantt chart row guide lines: faint horizontal lines every 3 rows to help visually track activities to their bars. On by default; toggle in the Gantt appearance panel under Shading.",
        ],
      },
    ],
  },
  {
    version: "0.33.3",
    date: "2026-03-28",
    sections: [
      {
        title: "Changed",
        items: [
          "Gantt chart color presets expanded from 4 to 10: Classic, Professional, Colorful, Grayscale, Contrast, Forest, Ocean, Sunset, Lavender, Earth.",
          "Retired Monochrome and Warm presets; existing projects using them fall back to Classic.",
          "About page: removed \"IT\" qualifier from project manager audience description.",
          "About page: License section now links to the GitHub LICENSE file and discloses the Section 7(b) non-permissive attribution requirements.",
        ],
      },
    ],
  },
  {
    version: "0.33.2",
    date: "2026-03-28",
    sections: [
      {
        title: "Enhanced",
        items: [
          "Cumulative Distribution Function (CDF) chart tooltip now shows projected finish date alongside duration and probability when hovering over the curve, making it easy to answer \"what's the probability my project finishes by this date?\"",
          "Scenario comparison CDF chart tooltip also includes projected finish dates.",
        ],
      },
    ],
  },
  {
    version: "0.33.1",
    date: "2026-03-28",
    sections: [
      {
        title: "Changed",
        items: [
          "Default distribution type changed from Normal (T-Normal) to Triangular, aligning with the recommended distribution for the updated heuristic defaults.",
          "Default heuristic minimum changed from 50% to 75%, bringing congruence with Triangular distribution recommendations.",
          "Footer now includes a \"License\" link to the project's GNU GPL v3.0 LICENSE file on GitHub (with Section 7(b) non-permissive additional terms).",
        ],
      },
    ],
  },
  {
    version: "0.33.0",
    date: "2026-03-28",
    sections: [
      {
        title: "Chore — Clean Code Audit",
        items: [
          "Added eslint-plugin-sonarjs (recommended ruleset) and @vitest/coverage-v8 as dev dependencies.",
          "Reduced ESLint findings from 144 to 98 (46 eliminated, 12 of 15 rules fully resolved).",
          "Fixed: removeById() delegates to remove(), nested template literals extracted to named consts, useEffect dependency array corrected, dead test code removed.",
          "Suppressed 33 intentional or false-positive findings across 8 rules with eslint-disable + NOSONAR comments.",
          "Deleted macOS copy artifact: src/core/schedule/target-rag 2.ts.",
          "Deferred structural complexity findings (no-nested-conditional, cognitive-complexity, no-nested-functions) for future refactor passes.",
        ],
      },
    ],
  },
  {
    version: "0.32.3",
    date: "2026-03-28",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Gantt chart: reduced Today proximity suppression threshold from 60px to 44px. On compressed fit-to-window timelines (1,500+ day projects), the previous threshold suppressed quarterly ticks that had adequate visual clearance, leaving gaps in the timeline header (e.g. Q2 → Q4 with no Q3 label).",
        ],
      },
    ],
  },
  {
    version: "0.32.2",
    date: "2026-03-27",
    sections: [
      {
        title: "Security",
        items: [
          "Activity Edit Modal: added date format validation guard on Actual Finish Date blur handler to prevent malformed strings from propagating NaN through calendar math.",
          "Activity Edit Modal: actual duration input now clamps to positive integers (Math.max(1, Math.floor)) at both the handler and save layers, preventing negative, zero, or NaN values from reaching the store.",
          "Activity Edit Modal: replaced magic number 10000 with exported MAX_CALENDAR_ITERATIONS constant for non-work-day snapping loop guard.",
        ],
      },
      {
        title: "Internal",
        items: [
          "Exported MAX_CALENDAR_ITERATIONS from @core/calendar/calendar for reuse in UI handlers.",
        ],
      },
    ],
  },
  {
    version: "0.32.1",
    date: "2026-03-27",
    sections: [
      {
        title: "Refactoring",
        items: [
          "ActivityEditModal: extracted ScheduleContextRow local component and buildFieldUpdates() sub-function for cleaner save/dirty-check logic.",
          "GanttChart: extracted GanttToolbar local component (~108 lines) from the main render body.",
          "gantt-utils: consolidated monthTickLabel, quarterlyTickLabel, semiannualTickLabel via shared tickLabelWithYear helper.",
          "gantt-utils: completed toISO deprecation — all internal uses replaced with formatDateISO from @core/calendar/calendar.",
          "gantt-utils: removed buildOrderedActivities no-op function and its 4 tests.",
          "activity-row-helpers: documented computeElapsedDays dual-type calendar parameter.",
        ],
      },
      {
        title: "Tests",
        items: [
          "Added 5 new tests: semiannualTickLabel edge case, countQuarterlyTicks/countSemiannualTicks same-day boundaries, generateTicks forced monthly, computeWeekendShadingRects trailing span closure.",
        ],
      },
    ],
  },
  {
    version: "0.32.0",
    date: "2026-03-27",
    sections: [
      {
        title: "New Features",
        items: [
          "Gantt chart Fit to Window toggle: compresses the full project timeline into the visible container width with no horizontal scrolling. Enables the copy-image button to capture the complete chart for presentations.",
          "Gantt chart Timeline Labels control (Sparse / Normal / Dense): directly selects tick granularity for multi-year projects. Dense = monthly, Normal = quarterly (Q1-Q4), Sparse = semi-annual (H1/H2). Works with or without Fit to Window.",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Quarterly and semi-annual tick labels show year on first tick and year-change boundaries (e.g. Q2 '26, Q3, Q4, Q1 '27).",
          "Year-carrying tick labels render in bold for easy year-break identification.",
          "Today line proximity suppression prevents tick labels from crowding the Today date label.",
          "Print chart parity for all tick density, bold year labels, and collision suppression changes.",
        ],
      },
      {
        title: "Internal",
        items: [
          "Schema version 18 → 19 (migration adds fitToWindow to Gantt appearance settings).",
        ],
      },
    ],
  },
  {
    version: "0.31.0",
    date: "2026-03-27",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity Edit Modal: bidirectional Actual Finish Date field for completed activities. Enter a finish date to auto-calculate duration, or enter a duration to auto-calculate the finish date. Uses the project work calendar for accurate working-day math.",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Activity Edit Modal: Actual Duration field now editable for in-progress activities, matching the activity grid behavior. Shows 'Elapsed' placeholder when empty; falls back to computed elapsed working days on save if cleared.",
          "Estimates section in Activity Edit Modal now defaults to collapsed, reducing visual noise on modal open.",
        ],
      },
    ],
  },
  {
    version: "0.30.5",
    date: "2026-03-27",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Dependency type dropdowns and labels now show full names (Finish-to-Start, Start-to-Start, Finish-to-Finish) instead of two-letter abbreviations for improved clarity.",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Centralized dependency type labels into dependencyLabel() formatter in format-labels.ts, replacing the local constant in DependencyEditModal.",
        ],
      },
    ],
  },
  {
    version: "0.30.4",
    date: "2026-03-27",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Gantt bar label font size now scales with the activity font size selection (Small/Normal/Large/XL). Small is the minimum — larger settings increase readability.",
          "Bar labels (dates or durations) are hidden when they don't fit inside the bar, preventing clipped or overlapping text.",
          "Bar label font is automatically capped to fit within the bar height when compact row density is combined with large/XL font sizes.",
        ],
      },
    ],
  },
  {
    version: "0.30.3",
    date: "2026-03-26",
    sections: [
      {
        title: "New Features",
        items: [
          "Drag-and-drop scenario tab reordering: grab the grip handle on any scenario tab to drag it to a new position.",
        ],
      },
    ],
  },
  {
    version: "0.30.2",
    date: "2026-03-26",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed CDF comparison chart legend overlap: scenario names were clipped by the x-axis label. Consolidated axis label into caption below the chart.",
        ],
      },
      {
        title: "Testing",
        items: [
          "Added 67 mutation-testing gap-closure tests across constraint-utils, dependency-graph, and deterministic scheduler modules.",
          "Boundary equality tests for all 6 constraint types (MSO, MFO, SNET, FNET, SNLT, FNLT) in forward pass, backward pass, and conflict detection.",
          "SS/FF dependency backward pass tests: late dates, total float, and lag accounting.",
          "SS/FF forward pass tests: negative lag clamping to project start, positive lag offsets.",
          "SS/FF dependency violation detection coverage.",
          "Working-day skip loop tests: Saturday, Sunday, and holiday start date advancement.",
          "actualDuration guard tests: complete and inProgress activities with/without actualDuration.",
          "Conflict result shape tests: undefined vs array for constraintConflicts and dependencyConflicts.",
          "Critical path tests: maxPredEF correctness with hard MFO constraints, empty graph, milestone floor, cycle path structure.",
          "Invalid dependency filtering: non-existent IDs, self-loops, validateDependencies error types.",
        ],
      },
    ],
  },
  {
    version: "0.30.1",
    date: "2026-03-26",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed activity name overflow at larger font sizes: character limits now scale inversely with font size.",
          "Fixed small font size mapping (was 10px, now 11px as designed).",
          "Fixed comfortable row density dimensions (rowHeight 42→44px, printRowHeight 24→25px).",
          "Fixed print Gantt dependency lag label using hardcoded font size instead of scaled value.",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Extracted weekend shading computation to shared computeWeekendShadingRects() pure function in gantt-utils.ts.",
        ],
      },
    ],
  },
  {
    version: "0.30.0",
    date: "2026-03-26",
    sections: [
      {
        title: "New Features",
        items: [
          "Per-project Gantt chart appearance controls: name column width, font size, row density, and bar label format.",
          "Color preset system with 4 built-in themes (Classic, Monochrome, Ocean, Warm) that work in both light and dark mode.",
          "Custom bar colors: override planned and in-progress bar colors with any color via swatch picker or color input.",
          "Weekend/non-work day shading: optional gray bands on the Gantt chart highlighting non-working days.",
          "Appearance settings travel with the project on export/import.",
          "Print Gantt chart mirrors all appearance settings (layout, colors, font scaling, weekend shading).",
          "Palette icon toggle button in the Gantt toolbar to show/hide the appearance panel.",
        ],
      },
      {
        title: "Technical",
        items: [
          "New resolveGanttAppearance() pure function maps settings to concrete pixel values and colors.",
          "Hatch patterns now use strokeOpacity approach with bar colors instead of separate named hatch colors.",
          "dateToX() no longer has a default leftMargin parameter — all call sites pass it explicitly.",
          "useGanttLayout hook parameterized with leftMargin, rowHeight, and barHeight.",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema v17 → v18: Added optional ganttAppearance field to Project.",
        ],
      },
    ],
  },
  {
    version: "0.29.3",
    date: "2026-03-26",
    sections: [
      {
        title: "New Features",
        items: [
          "\"Show Activity IDs\" toggle now persists per project instead of resetting on page navigation.",
          "Print report now includes Finish Target date in the Project Summary section.",
          "Print report header shows the app version for traceability.",
          "Gantt timeline now shows monthly tick marks for projects spanning 91+ days, with year shown on first tick and at year boundaries.",
          "Gantt \"Today\" line now shows the formatted date beneath the label, matching milestone label style.",
          "Month gridlines are always visible even when labels are suppressed by collision with Today/Finish/Milestone markers.",
          "\"Show Finish Target Date\" checkbox shows a tooltip explaining why it's disabled when no target date is set.",
        ],
      },
      {
        title: "UI Polish",
        items: [
          "Print report tasks/deliverables tables redesigned with activity header rows and indented items for clearer visual hierarchy.",
          "ToS/Privacy notification banner no longer appears on printed PDF reports.",
          "Fixed Chrome print quirk where fixed-position elements ignored display: none.",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema v16 → v17: Added optional showActivityIds field to Project.",
        ],
      },
    ],
  },
  {
    version: "0.29.2",
    date: "2026-03-25",
    sections: [
      {
        title: "Refactor",
        items: [
          "Extracted shared renderItemTable helper in PrintableReport, eliminating duplicate Activity Tasks / Activity Deliverables table rendering.",
          "Extracted formatItemColumn helper in schedule-export-service, deduplicating tasks/deliverables column logic in buildGridRows.",
          "Extracted ActivityProgressBars named component in UnifiedActivityRow, replacing the inline IIFE with a clearer sub-component.",
        ],
      },
      {
        title: "UI Polish",
        items: [
          "Deliverables progress bar color changed from teal to indigo for better visual distinction from the green completed-tasks bar.",
          "Deliverables checkbox color updated to indigo to match progress bar.",
        ],
      },
      {
        title: "Security",
        items: [
          "Patched 3 high-severity transitive dependency vulnerabilities (undici, picomatch, flatted).",
        ],
      },
    ],
  },
  {
    version: "0.29.1",
    date: "2026-03-25",
    sections: [
      {
        title: "UI Polish",
        items: [
          "Activity edit modal section counts (Tasks, Deliverables) now render in a smaller, lighter font for softer visual hierarchy.",
          "Blue dot indicators added to Scheduling Constraint and Dependencies section headers when content is present, matching the existing Notes indicator.",
          "Unsaved changes guard on activity edit modal: clicking outside with pending changes prompts to save. The explicit Cancel button always discards without prompting.",
        ],
      },
    ],
  },
  {
    version: "0.29.0",
    date: "2026-03-25",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity Deliverables — track deliverables (documents, artifacts, sign-offs) per activity with a checklist-style UI. Appears in activity edit modal, schedule export, and print report.",
          "Activity Notes — free-text notes field per activity (up to 2,000 characters) in the activity edit modal. Blue dot indicator when notes are present.",
          "Scenario Notes — free-text notes per scenario via memo icon in the summary card. Blue dot indicator when non-empty.",
          "Finish Target placeholder styling — lighter font weight when no date is set for clearer visual distinction.",
        ],
      },
      {
        title: "Progress Bars",
        items: [
          "Activity row progress bars now support deliverables: teal bar for in-progress, green when all delivered.",
          "When both tasks and deliverables are present, two half-width bars display side by side.",
        ],
      },
      {
        title: "Export & Print",
        items: [
          "Schedule export (XLSX/CSV) includes two new columns: Deliverables and Deliverable Details.",
          "Print report includes an Activity Deliverables table.",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema version bumped from 15 to 16 (passthrough migration).",
          "Checklist item limit raised from 20 to 50 per activity.",
        ],
      },
    ],
  },
  {
    version: "0.28.2",
    date: "2026-03-25",
    sections: [
      {
        title: "Security",
        items: [
          "CSV formula injection guard expanded to cover tab and carriage return prefix characters per OWASP guidance.",
          "Added dedicated test coverage for CSV formula injection guard across all export paths.",
          "Suppressed false-positive ESLint react-hooks/refs error in PercentileTable with documented rationale.",
        ],
      },
    ],
  },
  {
    version: "0.28.1",
    date: "2026-03-25",
    sections: [
      {
        title: "Refactor",
        items: [
          "Extracted RAG schedule health computation to a pure, testable utility (computeTargetRAGColor) — memoized at call site for better render performance.",
          "Extracted Gantt chart preferences into a consolidated useGanttPreferences hook, reducing GanttChart.tsx by ~50 lines.",
          "Extracted Schedule Health threshold UI into a standalone ScheduleHealthSection component.",
          "Cleaned up redundant prop spread in GanttSection.",
        ],
      },
      {
        title: "Dependencies",
        items: [
          "Updated firebase, react-router-dom, recharts, typescript-eslint, eslint, @eslint/js, @vitejs/plugin-react to latest stable minor/patch releases.",
        ],
      },
    ],
  },
  {
    version: "0.28.0",
    date: "2026-03-25",
    sections: [
      {
        title: "New Features",
        items: [
          "Finish Target Date — set a project-level target finish date (e.g., the date promised in your project charter) in the summary card. The target date appears between the Start and Finish dates for quick reference.",
          "Gantt chart Target line — optionally display the finish target as a vertical dashed line on the Gantt chart. Toggle visibility via the 'Show Finish Target Date' checkbox in the Gantt toolbar.",
          "RAG schedule health indicator — the Target line and Finish Target date in the summary card reflect schedule health: green (simulation finishes by the green percentile), amber (within the amber threshold), or red (at risk). Gray/blue when no simulation has been run.",
          "Configurable RAG thresholds — set Green and Amber percentile thresholds in Settings under 'Finish Target — Schedule Health'. Defaults: Green at P80, Amber at P50.",
          "Monochrome-safe dash patterns — the Target line uses distinct dash patterns per RAG state (long dashes for green, medium for amber, dots for red) so schedule health is distinguishable on black-and-white prints.",
        ],
      },
    ],
  },
  {
    version: "0.27.0",
    date: "2026-03-24",
    sections: [
      {
        title: "New Features",
        items: [
          "Estimation Heuristics Suggester — new inline panel in Settings that helps you choose informed heuristic min/max percentages by selecting your industry domain and activity subdomain from a curated 73-entry reference table spanning 23 industries. Displays suggested optimistic and pessimistic percentages with rationale, and applies values to your heuristic defaults with one click.",
        ],
      },
    ],
  },
  {
    version: "0.26.2",
    date: "2026-03-24",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Corrected activity end date calculation. Previously, end dates were computed one working day too late (e.g., a 5-day activity starting Monday showed an end date of the following Monday instead of Friday). This also caused a 1-day gap between sequential activities. All scheduled dates are now consistent with standard project management conventions: the end date is the last working day of the activity. Existing project data is unaffected — only displayed schedule dates change.",
        ],
      },
    ],
  },
  {
    version: "0.26.1",
    date: "2026-03-24",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Redesigned bulk action toolbar: added Status dropdown (Planned, In Progress, Complete) alongside Confidence and Distribution. All three dropdowns now stage selections until you click \"Apply.\" When applying a distribution change with heuristics enabled, you're prompted to recalculate min/max using current heuristic percentages.",
          "The browser's \"Save as PDF\" default filename now includes the project name and today's date (e.g., \"SPERT Scheduler for My Project - March 24, 2026.pdf\").",
        ],
      },
    ],
  },
  {
    version: "0.26.0",
    date: "2026-03-23",
    sections: [
      {
        title: "Enhancements",
        items: [
          "New \"Show Activity IDs\" toggle in the Gantt chart toolbar. When enabled, sequential number prefixes (#1, #2, #3...) appear before activity names across the Gantt chart, activity grid, dependency panel, milestone panel, warnings panel, and modal dialogs — making it easy to reference specific activities by number during team conversations. Numbers match the # column in the schedule export. Toggle is session-only and resets on page reload.",
        ],
      },
    ],
  },
  {
    version: "0.25.3",
    date: "2026-03-23",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Activity Edit Modal now applies heuristic min/max auto-fill when the Most Likely value is changed, matching the behavior of the activity grid. Previously, editing ML in the modal with heuristics enabled did not recalculate min and max.",
        ],
      },
    ],
  },
  {
    version: "0.25.2",
    date: "2026-03-23",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Total Float and Free Float are now surfaced in three places in Dependency Mode: the schedule export (XLSX and CSV) includes new float columns; hovering over a Gantt activity bar shows a tooltip with scheduled dates and float values; and the Activity Edit Modal includes a new read-only Schedule Analysis section. Activities on the critical path are identified as such (Total Float = 0). Float values are only shown in Dependency Mode and do not appear in sequential mode schedules.",
          "Schedule export filenames now prefixed with \"spert-scheduler\" for easy identification.",
        ],
      },
    ],
  },
  {
    version: "0.25.1",
    date: "2026-03-23",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Copy image button now shows a disabled state with an explanatory tooltip in browsers that do not support image clipboard writes (Firefox). Chrome, Edge, and Brave are unaffected.",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Added Import Activities quick reference guide (PDF) link to the import section",
          "Updated Quick Reference Guide for v0.25.0",
          "PDF links now open in a new browser tab instead of triggering a download",
        ],
      },
    ],
  },
  {
    version: "0.25.0",
    date: "2026-03-22",
    sections: [
      {
        title: "New Features",
        items: [
          "Import activities from CSV file or clipboard paste — parse spreadsheet data into a new scenario with full validation, dependency resolution, and cycle detection",
          "Download CSV template with 10 example activities demonstrating all four distribution types (T-Normal, LogNormal, Triangular, Uniform) with realistic dependency chains",
          "Live preview with debounced parsing, row-level error/warning display, and summary statistics",
          "Import to a new project or add as a scenario to an existing project, with one-click navigation to the imported project",
          "Confidence Level is optional for Triangular and Uniform distributions (only affects T-Normal and LogNormal)",
        ],
      },
    ],
  },
  {
    version: "0.24.4",
    date: "2026-03-21",
    sections: [
      {
        title: "New Features",
        items: [
          "Dependency panel sort toggle — switch between alphabetical (A→Z) and schedule order (by predecessor start date) to view dependencies in the order they appear in the schedule",
        ],
      },
    ],
  },
  {
    version: "0.24.3",
    date: "2026-03-20",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Scheduling constraints (SNET, MSO, MFO, FNET) now work in sequential (non-dependency) mode — previously constraints were silently ignored when dependency mode was off",
          "Monte Carlo simulation in sequential mode now respects constraint-induced schedule gaps (position-tracking path with per-trial constraint application)",
        ],
      },
    ],
  },
  {
    version: "0.24.2",
    date: "2026-03-20",
    sections: [
      {
        title: "Security",
        items: [
          "Gate project name console.warn behind import.meta.env.DEV in Firestore driver",
          "Add CSV formula injection guard to simulation CSV export csvEscape() for suite consistency",
        ],
      },
    ],
  },
  {
    version: "0.24.1",
    date: "2026-03-20",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract ChecklistSection component from ActivityEditModal (~130 LOC reduction) with controlled component pattern",
          "Deduplicate CONSTRAINT_LABELS — shared constant and constraintLabel() helper now in @domain/helpers/constraint-labels.ts",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fix handleAddTask stale closure — checklist.length in useCallback dependency array caused unnecessary recreations",
        ],
      },
    ],
  },
  {
    version: "0.24.0",
    date: "2026-03-20",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity task checklists — add, toggle, reorder, and remove tasks within each activity via the Activity Edit modal",
          "New \"Tasks\" section in Activity Edit modal with drag-and-drop reordering (max 20 tasks per activity)",
          "Thin progress bar under activity name in grid — color-coded: blue for in-progress, green when all tasks complete; clickable to open Activity Edit modal",
          "Checklist progress visible in print report as \"Activity Tasks\" section with per-activity completion counts",
          "Schedule export (XLSX/CSV) includes Tasks summary and Task Details columns",
        ],
      },
      {
        title: "UI Improvements",
        items: [
          "Task input retains focus after adding a task for rapid entry of multiple tasks",
        ],
      },
      {
        title: "Technical",
        items: [
          "Schema v13 → v14 migration (optional checklist field on Activity)",
          "Dedicated store method for checklist updates preserves simulation results (no unnecessary re-runs)",
          "Activity duplication and scenario cloning generate fresh checklist item IDs",
        ],
      },
    ],
  },
  {
    version: "0.23.1",
    date: "2026-03-19",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix CDF chart x-axis \"Duration (days)\" label clipped by insufficient bottom margin",
          "Fix print Gantt dependency arrows rendering on top of bars instead of behind them",
        ],
      },
      {
        title: "Performance",
        items: [
          "Bootstrap CI computation 17× faster — batch all percentiles per sort instead of sorting per percentile",
          "Show 95% CI toggle now defers computation via setTimeout(0) to keep checkbox responsive",
        ],
      },
      {
        title: "UI Improvements",
        items: [
          "Print Gantt buffer row label changed from \"Buffer\" to \"Schedule Buffer\" to match interactive chart",
          "Print Gantt buffer bar uses hatched yellow fill instead of solid yellow to match interactive chart",
          "Gantt buffer bar duration label (+Xd) now has a white halo for readability over hatched pattern",
          "Activity Edit modal: Name and Status fields side-by-side for compact layout",
          "Dependency Edit modal: Relationship Type and Lag Days side-by-side; predecessor/successor always editable via dropdowns",
          "Dependency panel: list sorted alphabetically by predecessor then successor name",
          "Dependency panel: click any row to open edit modal for full dependency editing",
          "Dependency panel: placeholder text in add-dependency dropdowns styled with muted color",
          "Locked scenarios: Gantt chart arrows fully unresponsive (no hover highlight, tooltip, or click)",
          "Constraint column dash and tags show pointer cursor to indicate clickability",
          "Scenario summary card: improved toggle-to-label spacing",
        ],
      },
    ],
  },
  {
    version: "0.23.0",
    date: "2026-03-19",
    sections: [
      {
        title: "New Features",
        items: [
          "Click any Gantt chart bar to open the expanded Activity Edit modal — edit name, status, estimates, constraints, and dependencies all in one place",
          "Click any dependency arrow in the Gantt chart to edit its relationship type, lag days, or delete it via a new Dependency Edit modal",
          "Hover over dependency arrows to highlight them with thicker strokes and brighter colors for easy identification",
          "Add new dependencies directly from the Activity Edit modal's Dependencies section",
          "Terminal activity markers on Gantt chart — right-edge stripe automatically marks activities with no successor in dependency mode",
        ],
      },
    ],
  },
  {
    version: "0.22.3",
    date: "2026-03-19",
    sections: [
      {
        title: "New Features",
        items: [
          "Click activity names in the Gantt chart to rename them inline — saves on blur or Enter, cancel with Escape",
        ],
      },
      {
        title: "UI Improvements",
        items: [
          "Gantt legend reordered: Complete, In Progress, Planned (matches workflow progression)",
          "Gantt legend: Today now appears before Finish to match left-to-right reading order on chart",
        ],
      },
    ],
  },
  {
    version: "0.22.2",
    date: "2026-03-19",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix histogram buffer shading not appearing when Parkinson's Law clamps all trials above deterministic duration",
        ],
      },
      {
        title: "Security",
        items: [
          "Add hasOnly() field constraints to Firestore users/{uid} write rule to prevent arbitrary field injection",
          "Add hasOnly() field constraints to Firestore spertscheduler_settings write rule to restrict writable keys",
          "Add defensive ?? true fallback to Parkinson's Law preference read in Settings page",
          "Harden schema migration v12→v13 to normalize non-boolean parkinsonsLawEnabled values via typeof check",
        ],
      },
    ],
  },
  {
    version: "0.22.1",
    date: "2026-03-18",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract shared ToggleSwitch component from ScenarioSummaryCard and PreferencesSection (6 duplicated toggle instances → 1 reusable component)",
        ],
      },
      {
        title: "Dependencies",
        items: [
          "Upgrade zustand 5.0.11→5.0.12, tailwindcss 4.2.1→4.2.2, @tailwindcss/vite 4.2.1→4.2.2, typescript-eslint 8.57.0→8.57.1, @types/react 19.2.10→19.2.14",
        ],
      },
    ],
  },
  {
    version: "0.22.0",
    date: "2026-03-18",
    sections: [
      {
        title: "Features",
        items: [
          "Add configurable Parkinson's Law toggle — disable per-scenario to allow simulated activity durations below the deterministic schedule",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Add Parkinson's Law status to printed project report",
          "Add Parkinson's Law default toggle to user preferences",
          "Compact scenario summary card layout — consolidate target labels, shrink heuristic inputs, add tooltips to all toggles",
        ],
      },
    ],
  },
  {
    version: "0.21.2",
    date: "2026-03-18",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix LogNormal distribution sparkline curve peaking at wrong position — peak now aligns with the most-likely (mode) marker",
          "Fix mode marker vertical line offset in all distribution sparklines — now accounts for SVG padding to align with curve peak",
          "Fix histogram Buffer shading starting at Monte Carlo mean instead of deterministic P50 duration — shaded region now matches the summary card buffer",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Make \"Run simulation\" text clickable in schedule buffer placeholder, giving users a third trigger point for simulation",
        ],
      },
      {
        title: "Security",
        items: [
          "Add CSV formula injection guard for schedule exports",
          "Add 10 MB file size guard at the import service layer",
          "Filter scenario memory localStorage entries to string values only",
          "Gate preferences validation logging behind development mode",
          "Document Firestore enum validation limitations in SECURITY.md",
        ],
      },
    ],
  },
  {
    version: "0.21.1",
    date: "2026-03-18",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract type-dispatch helpers in scheduling core to deduplicate SS/FF/FS forward and backward pass logic",
          "Extract shared WarningItem component in WarningsPanel for consistent constraint/dependency conflict rendering",
        ],
      },
    ],
  },
  {
    version: "0.21.0",
    date: "2026-03-18",
    sections: [
      {
        title: "New Features",
        items: [
          "Add Start-to-Start (SS) and Finish-to-Finish (FF) dependency relationship types alongside existing Finish-to-Start (FS)",
          "Type-aware forward/backward pass scheduling in both integer and date domains",
          "Dependency type selector in add form and inline editing on existing dependencies",
          "Type-aware Gantt chart arrow anchors: SS left-to-left, FF right-to-right, FS right-to-left",
          "Dependency constraint violation detection and display in Warnings panel",
          "Schedule export (XLSX/CSV) shows dependency type in predecessor/successor references (e.g., 1FS+2d, 2SS, 3FF)",
          "Gantt chart toggle to show/hide dependency arrows (persisted preference)",
          "FF arrows use U-turn path with left-pointing arrowhead at successor's finish",
        ],
      },
      {
        title: "Technical",
        items: [
          "Schema v11→v12 migration with defensive type write-forward",
          "Unified LS-based backward pass for all dependency types",
          "Post-pass dependency validation with sign-dispatch for negative lag",
        ],
      },
    ],
  },
  {
    version: "0.20.4",
    date: "2026-03-18",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Add optional constraint note field (up to 500 characters) to document constraint rationale",
          "Add Constraints section to print report with Type, Date, Mode, and Note columns",
          "Add Constraint Note column to XLSX/CSV schedule exports",
          "Add SPERT® branding to print report header and footer",
          "Add sign-in buttons to Cloud Storage settings section for discoverability",
        ],
      },
    ],
  },
  {
    version: "0.20.3",
    date: "2026-03-18",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix heuristic Min/Max % inputs rejecting intermediate keystrokes (now validates on blur)",
          "Format constraint warning dates to match user's date format preference",
          "Change Clear constraint button color from red to green (no-error semantic)",
          "Use unique blue C icon for constraint legend indicator (was identical to Planned)",
          "Remove misleading hover pencil icon from Gantt chart rows",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Move schedule export (XLSX/CSV) buttons into summary card buffer row, reclaiming vertical space",
        ],
      },
    ],
  },
  {
    version: "0.20.2",
    date: "2026-03-17",
    sections: [
      {
        title: "Security",
        items: [
          "Escalate write-forward migration failures to error callback",
          "Add iteration guard to constraint date picker non-working-day snap loop",
          "Validate constraint type/mode enum domains in worker payload filter",
          "Reject schema versions below 1 on project import",
          "Fix localStorage key namespace collision for active-scenario persistence",
          "Harden filename sanitization: empty fallback, 200-char truncation",
          "Log Zod validation failures in preferences loader for diagnostics",
        ],
      },
    ],
  },
  {
    version: "0.20.1",
    date: "2026-03-17",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract useScenarioComparison hook from ProjectPage (comparison mode state + handlers)",
          "Extract EstimateInputs component from UnifiedActivityRow (Min/ML/Max numeric inputs)",
          "Extract BulkActionToolbar component from UnifiedActivityGrid (bulk selection UI)",
        ],
      },
    ],
  },
  {
    version: "0.20.0",
    date: "2026-03-17",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity scheduling constraints: MSO, MFO, SNET, SNLT, FNET, FNLT with Hard/Soft modes",
          "Activity Edit Modal for managing scheduling constraints (click constraint badge in grid or edit icon on Gantt hover)",
          "Warnings Panel showing constraint conflicts and violations with severity levels",
          "Constraint column in activity grid (dependency mode) with clickable badges",
          "Constraint indicators on Gantt chart bars (interactive and print)",
          "Dual backward pass: constraint-adjusted late dates (display) + network-driven late dates (CPM float)",
          "Monte Carlo simulation respects hard constraints per trial (MSO, MFO, SNET, FNET clamping)",
          "Schema v10 to v11 migration with write-forward for Firestore",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Schedule export (XLSX/CSV) includes constraint type, date, and mode columns",
          "Gantt legend includes constraint indicator when constraints are present",
          "Sequential-mode banner when constraints exist but dependency mode is off",
          "totalFloat computed from network-driven backward pass (not constraint-adjusted)",
          "Soft constraint badges in activity grid show amber shading when a warning condition exists",
          "Wider activity name column in grid \u2014 reclaimed space from Distribution, Min/ML/Max, Confidence, and Actions columns",
          "Wider activity name area in Gantt chart (interactive and print) \u2014 shows up to 38 characters",
          "Date format option changed from YYYY-MM-DD to YYYY/MM/DD to prevent line-wrapping in grid cells",
          "Removed duplicate activity button from grid rows",
        ],
      },
    ],
  },
  {
    version: "0.19.3",
    date: "2026-03-17",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Add \"Date prepared\" label to bottom-right of Gantt chart (interactive + print), providing context when the chart is copied or shared",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fix Max % heuristic input not accepting typed values (removed HTML min constraint that blocked intermediate keystrokes)",
          "Fix Gantt chart showing activities in topological sort order instead of grid order when dependency mode is enabled",
        ],
      },
    ],
  },
  {
    version: "0.19.2",
    date: "2026-03-17",
    sections: [
      {
        title: "Security",
        items: [
          "Validate cached country data with Zod before use (loadCachedCountries)",
          "Add regex guard and encodeURIComponent on country code before URL construction (fetchPublicHolidays)",
          "Namespace localStorage cache key to spert-scheduler:nager-countries",
        ],
      },
    ],
  },
  {
    version: "0.19.1",
    date: "2026-03-17",
    sections: [
      {
        title: "Improvements",
        items: [
          "Updated ARCHITECTURE.md and SECURITY.md with v0.19.0 domain model, calendar validation, and security documentation",
          "Simplified Zustand selectors in CalendarPage and useWorkCalendar hook (removed unnecessary useShallow wrappers)",
        ],
      },
    ],
  },
  {
    version: "0.19.0",
    date: "2026-03-17",
    sections: [
      {
        title: "New Features",
        items: [
          "Configurable work week: click interactive day pills to toggle work days on/off, supporting any combination including non-contiguous schedules (e.g., Mon/Wed/Fri)",
          "Converted work days: override non-work days as work days on a per-project basis (e.g., make specific Saturdays count as work days)",
          "Smart validation: warns when adding a date that is already a work day or falls on a holiday",
          "Amber warning when converted work day list exceeds 50 entries, suggesting work week adjustment instead",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Holiday-blocked conversion notification now persists until acknowledged via \"Got it\" button (replaces auto-dismiss toast)",
          "Calendar page dynamically describes the active work week instead of hardcoded \"Monday through Friday\"",
          "All scheduling, Gantt charts, and exports respect the configured work week",
          "CalendarConfigurationError banner when work week settings produce no valid work days",
          "Zustand store selectors refactored to eliminate re-render cascades",
        ],
      },
      {
        title: "Testing",
        items: [
          "Added 85 new tests (643 → 728 total) covering work weeks, holidays, calendar layering, date boundaries, and Monte Carlo edge cases",
          "6 property-based tests (fast-check) for calendar round-trips and Parkinson's Law floor guarantees",
        ],
      },
    ],
  },
  {
    version: "0.18.2",
    date: "2026-03-16",
    sections: [
      {
        title: "Security",
        items: [
          "Added Zod schema validation to Nager.Date API responses (countries and holidays)",
          "Added runtime type guards to worker milestone/dependency payload conversion",
          "Added filename sanitization for schedule exports (strips invalid characters)",
        ],
      },
    ],
  },
  {
    version: "0.18.1",
    date: "2026-03-16",
    sections: [
      {
        title: "Improvements",
        items: [
          "Decomposed CalendarEditor.tsx (619 LOC) into HolidayLoader, HolidayList, and shell (~150 LOC each)",
          "Fixed memory leak in downloadFile(): wrapped URL.createObjectURL() in try-finally to ensure cleanup on error",
        ],
      },
    ],
  },
  {
    version: "0.18.0",
    date: "2026-03-16",
    sections: [
      {
        title: "New Features",
        items: [
          "Schedule grid export: download the current scenario's activity schedule as a formatted XLSX or plain CSV file",
          "XLSX export includes professional formatting: bold headers, light fill, frozen column header row, auto-width columns, thin borders",
          "Summary metadata block at top of export: project/scenario name, dates, buffer, targets, dependency mode status",
          "Predecessor and Successor columns (dependency mode only) using activity numbers with lag notation (e.g., \"1 +2d, 3\")",
          "Export available from both the project page (inline button near grid) and the Settings page (Schedule Export section)",
          "XLSX/CSV toggle: active format button highlights blue to indicate last-exported format",
          "Disabled export hint with clickable \"Run simulation\" link that triggers simulation directly",
          "Confidence column blank in exports for Triangular and Uniform distributions (not applicable)",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Moved format-labels.ts from @ui/helpers to @domain/helpers (pure domain logic, fixes layer violation)",
          "Widened downloadFile() to accept BlobPart (string, ArrayBuffer, Uint8Array) for binary file downloads",
          "XLSX column A auto-sized to fit longest summary key label",
        ],
      },
    ],
  },
  {
    version: "0.17.0",
    date: "2026-03-16",
    sections: [
      {
        title: "New Features",
        items: [
          "Country holiday loader: select from 100+ countries to load public holidays via Nager.Date API",
          "Multi-country support: load holidays from multiple countries additively, with automatic name merging for shared dates",
          "Country labels on API holidays show origin country or \"Multi\" for shared dates",
          "Optional locale field for manual holidays (e.g., state or region name)",
          "Default country auto-detected from browser locale",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Holidays filtered to globally observed days only, visually distinguished from manual entries",
          "Selected country persists across sessions",
          "Built-in US holidays remain available as offline fallback when API is unavailable",
        ],
      },
    ],
  },
  {
    version: "0.16.4",
    date: "2026-03-16",
    sections: [
      {
        title: "Improvements",
        items: [
          "Updated first-run notification to clarify browsewrap agreement for all users",
        ],
      },
    ],
  },
  {
    version: "0.16.3",
    date: "2026-03-11",
    sections: [
      {
        title: "Infrastructure",
        items: [
          "Pinned Node.js version to 22 LTS (engines field, .nvmrc) ahead of Node 20 EOL",
          "Aligned @types/node to ^22 for Node 22 LTS type definitions",
        ],
      },
    ],
  },
  {
    version: "0.16.2",
    date: "2026-03-11",
    sections: [
      {
        title: "Security",
        items: [
          "Sharing operations now use Firestore transactions for atomic read-verify-write, preventing race conditions",
          "ISO date validation rejects invalid calendar dates (e.g., Feb 30, non-leap-year Feb 29)",
          "Sharing error messages unified to prevent email enumeration",
          "Email normalization ensures consistent case-insensitive user lookup",
          "ToS localStorage flags properly cleared on sign-out",
          "SECURITY.md and firestore.rules updated to match production configuration",
        ],
      },
    ],
  },
  {
    version: "0.16.1",
    date: "2026-03-11",
    sections: [
      {
        title: "Improvements",
        items: [
          "Decomposed GanttChart.tsx into useGanttLayout hook, GanttSvgDefs, and GanttLegend components",
          "Extracted PrintGanttChart from PrintableReport.tsx into its own file",
          "DRYed simulation parameter building into buildSimulationParams helper (shared by manual run and auto-run)",
          "Extracted useAutoRunSimulation hook from ProjectPage.tsx",
          "Updated recharts, react-router-dom, Tailwind CSS, and 7 other dependencies to latest stable versions",
          "Fixed recharts 3.8.0 Tooltip formatter type compatibility",
          "Resolved all 56 ESLint errors and 20 warnings across the codebase (zero remaining)",
          "Fixed conditional React hooks in AuthButton, SharingSection, and StorageModeSection (rules-of-hooks compliance)",
          "Added underscore-prefix convention for intentionally unused variables in ESLint config",
        ],
      },
    ],
  },
  {
    version: "0.16.0",
    date: "2026-03-11",
    sections: [
      {
        title: "Features",
        items: [
          "Added Terms of Service and Privacy Policy links in a persistent footer on every page",
          "Added first-run informational banner explaining optional Cloud Storage and legal agreements",
          "Added clickwrap consent modal that intercepts Cloud Storage sign-in — requires agreement to ToS and Privacy Policy before Firebase Auth",
          "Firestore ToS acceptance record written to users/{uid} after successful sign-in with read-before-write pattern",
          "Returning user version check on app load — signs out users with outdated or missing ToS acceptance",
          "Reference copies of Terms of Service and Privacy Policy added to /legal",
        ],
      },
    ],
  },
  {
    version: "0.15.3",
    date: "2026-03-10",
    sections: [
      {
        title: "Improvements",
        items: [
          "Added copyright headers to all source files with GPL v3 license attribution",
          "LICENSE file updated with author attribution block and Section 7 additional terms for attribution and UI notice preservation",
        ],
      },
    ],
  },
  {
    version: "0.15.2",
    date: "2026-03-09",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed project import silently failing in cloud storage mode — imported projects now sync to Firestore correctly",
          "Fixed real-time sync listeners not established for projects created or imported after initial cloud load",
          "Fixed race condition where switching storage modes during initial cloud load could overwrite local data",
          "User preferences now sync bidirectionally with Firestore in cloud storage mode",
          "Cancel pending debounced saves before project create/delete to prevent stale data overwrites",
          "Preferences migration now uses merge to preserve existing cloud preferences from other devices",
        ],
      },
    ],
  },
  {
    version: "0.15.1",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Gantt chart toggle states (view mode, today line, critical path, project name) now persist across page refreshes and browser sessions via user preferences",
          "Last-active scenario is remembered per project — reopening a project restores the scenario you were last working on instead of always defaulting to Baseline",
        ],
      },
    ],
  },
  {
    version: "0.15.0",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Print Gantt chart now matches interactive chart: dependency arrows with Bezier curves, critical path highlighting (red stripe + red arrows), finish line with date, today line, tick grid with labels, project name header, milestone target dates, and contextual legend",
        ],
      },
    ],
  },
  {
    version: "0.14.5",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Added optional project name header toggle to Gantt chart — when enabled, displays the project name left-justified at the top of the chart (included in copy-as-image)",
        ],
      },
    ],
  },
  {
    version: "0.14.4",
    date: "2026-03-09",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed Gantt chart copy-as-image still failing on SVG elements (dependency arrows, bars, text) that inherit oklch() colors; neutralization now covers all computed CSS properties on both HTML and SVG elements, plus Tailwind v4 CSS custom properties on :root",
        ],
      },
    ],
  },
  {
    version: "0.14.3",
    date: "2026-03-09",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed Gantt chart copy-as-image failing due to unhandled oklch() colors in the legend (Tailwind CSS v4); oklch values are now converted to RGB preserving visual fidelity",
        ],
      },
    ],
  },
  {
    version: "0.14.2",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Added Quick Reference Guide PDF download to the About page",
          "Updated About page: default trial count corrected to 10,000, data privacy section now describes optional cloud storage",
        ],
      },
    ],
  },
  {
    version: "0.14.1",
    date: "2026-03-08",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed cloud sync replacing local projects with empty data when Firestore returns no projects (data-loss guard)",
          "Fixed storage mode switching to cloud even when migration fails — mode now stays on local if migration errors or has failures",
        ],
      },
    ],
  },
  {
    version: "0.14.0",
    date: "2026-03-08",
    sections: [
      {
        title: "New Features",
        items: [
          "Critical path visualization: toggleable red left stripe on Gantt bars and red dependency arrows for critical-path activities (dependency mode only, on by default)",
          "Today's date line: toggleable violet dashed vertical line showing today's position on the Gantt chart timeline",
          "Gantt chart legend: contextual legend below the chart explains bar colors, critical path indicator, uncertainty hatching, finish line, today line, and milestones",
        ],
      },
    ],
  },
  {
    version: "0.13.0",
    date: "2026-03-08",
    sections: [
      {
        title: "New Features",
        items: [
          "In-progress activities now respect elapsed working days: the Actual column auto-populates with elapsed days when an activity is marked \"In Progress\"",
          "Monte Carlo simulation floors each trial at elapsed + 1 for in-progress activities, producing tighter schedule buffers that reflect work already completed",
          "Clearing and blurring the Actual field for an in-progress activity auto-recalculates elapsed days from the scheduled start date",
          "Gantt chart solid/hatched bars for in-progress activities reflect the elevated duration floor",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fixed milestone schedule stale data: adding/removing milestones with startsAtMilestone constraints now correctly triggers schedule recomputation",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Extracted resolveActivityDuration helper in deterministic.ts — DRYs identical 3-way branch (complete/inProgress/planned) from 4 functions",
          "Extracted mutateScenario helper in use-project-store.ts — DRYs lock-guard + undo + persist pattern from 15 store actions",
          "Decomposed SettingsPage.tsx (910 LOC) into 4 focused section components: PreferencesSection, LocalStorageSection, ExportSection, ImportSection",
          "Extracted changelog data array (670+ LOC) from ChangelogPage.tsx to changelog-data.ts",
          "Extracted activity row helpers (focusField, focusNextRow, focusPrevRow, computeElapsedDays) to activity-row-helpers.ts",
        ],
      },
      {
        title: "Quality",
        items: [
          "530 automated tests across 39 test files (up from 520/38 in v0.12.3)",
          "Added 10 sensitivity analysis tests covering empty input, sorting, variance contributions, coefficient of variation, zero-variance edge case, sdOverride, and getTopSensitiveActivities",
        ],
      },
    ],
  },
  {
    version: "0.12.3",
    date: "2026-03-07",
    sections: [
      {
        title: "Fixes",
        items: [
          "Scenario comparison now uses dependency-aware scheduling, fixing incorrect buffer and end-date values for scenarios with dependencies enabled",
        ],
      },
    ],
  },
  {
    version: "0.12.2",
    date: "2026-03-07",
    sections: [
      {
        title: "New Features",
        items: [
          "Gantt chart bars are now color-coded by activity status: blue (Planned), orange (In Progress), gray (Complete)",
          "Status colors apply to both interactive and print Gantt charts, including uncertainty hatching",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Activity grid inputs are now properly disabled when a scenario is locked",
          "Status column widened so \"In Progress\" displays without truncation",
        ],
      },
    ],
  },
  {
    version: "0.12.1",
    date: "2026-03-07",
    sections: [
      {
        title: "Improvements",
        items: [
          "Project start date is now editable via a date picker in the Scenario Summary Card",
          "Milestone panel moved above Predecessor panel so the Gantt chart is visible while editing dependencies",
          "Confidence field is disabled for distributions that don't use it (Triangular, Uniform) with explanatory tooltip",
          "Milestone label clarified: \"Must finish before\" \u2192 \"Must finish before milestone\"",
          "Gantt chart finish date uses abbreviated month names to prevent truncation",
          "Gantt chart font sizes increased for better readability (activity names, date labels, milestones)",
          "Activity name truncation limit increased from 20 to 23 characters on Gantt chart",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Tab navigation no longer gets stuck when Confidence field is disabled (Triangular/Uniform)",
          "Tab from Max field correctly skips disabled Confidence and reaches Distribution",
          "Removed unreachable dead code in distribution recommendation engine",
        ],
      },
    ],
  },
  {
    version: "0.12.0",
    date: "2026-03-07",
    sections: [
      {
        title: "Cloud Storage",
        items: [
          "Optional Firebase/Firestore cloud persistence on the shared spert-suite Firebase project",
          "Local-first architecture: app works identically without Firebase config; cloud is fully opt-in",
          "Storage mode toggle in Settings (Local/Cloud) with one-way migration from localStorage to Firestore",
          "Real-time sync across tabs and devices via Firestore onSnapshot listeners",
          "Simulation results stripped for cloud saves to stay within the Firestore 1 MB document limit",
        ],
      },
      {
        title: "Authentication",
        items: [
          "Google and Microsoft SSO via Firebase Authentication (popup with redirect fallback)",
          "Sign In button in the header (hidden when Firebase is not configured)",
          "User profile synced to Firestore on sign-in for email-based member lookup",
        ],
      },
      {
        title: "Project Sharing",
        items: [
          "Share projects with other users by email (owner/editor/viewer roles)",
          "Sharing panel on the project page for project owners in cloud mode",
          "Firestore security rules enforce role-based access and prevent editor privilege escalation",
        ],
      },
      {
        title: "Technical",
        items: [
          "Event bus pattern decoupling Zustand store from async Firestore writes",
          "Debounced cloud saves (500ms) with beforeunload flush for pending writes",
          "Cross-device preferences sync to Firestore",
          "Firebase SDK chunk splitting in Vite build for optimized loading",
          "511 automated tests across 38 test files",
        ],
      },
    ],
  },
  {
    version: "0.11.2",
    date: "2026-03-07",
    sections: [
      {
        title: "Security",
        items: [
          "Added Content Security Policy (CSP) meta tag to restrict script, style, image, and worker sources",
          "Added .max() length constraints to all Zod schema string fields (IDs: 64, names: 200, seeds: 100)",
          "Added .max() size constraints to all Zod schema array fields (activities: 500, deps: 2000, milestones: 100, samples: 100k, scenarios: 20, holidays: 1000)",
          "Fixed schema optionality mismatch: dependencies and milestones arrays are now required in ScenarioSchema (matching TypeScript interface and V8 migration guarantees)",
        ],
      },
    ],
  },
  {
    version: "0.11.1",
    date: "2026-03-07",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extracted milestone-service.ts from project-service.ts for focused milestone CRUD operations",
          "Extracted dependency-service.ts from project-service.ts for focused dependency CRUD operations",
          "Extracted buildMilestoneSimParams as a pure utility function in core/schedule for testability",
          "project-service.ts reduced from 418 to 290 LOC; new modules re-exported for backward compatibility",
          "ProjectPage.tsx reduced by 40+ LOC by removing inline milestone simulation parameter logic",
        ],
      },
      {
        title: "Quality",
        items: [
          "494 automated tests across 36 test files (up from 471/33 in v0.11.0)",
          "Added 5 mergeCalendars tests covering all input combinations and calendar integration",
          "Added 5 milestone-service tests covering add, remove, update, assign, and constraint operations",
          "Added 6 dependency-service tests covering add, remove, update lag, and bulk cleanup",
          "Added 7 milestone-sim-params tests including weekend/holiday snapping and calendar-aware offsets",
        ],
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-03-07",
    sections: [
      {
        title: "Milestones",
        items: [
          "Added Milestones feature: fixed-date checkpoints with per-milestone schedule buffer and health indicators",
          "Milestone Panel UI for creating, editing, and assigning activities to milestones (requires dependency mode)",
          "Per-milestone Monte Carlo simulation: tracks finish times for each milestone's activity set independently",
          "Milestone buffer calculation with slack days and health status (green/amber/red)",
          "Gantt chart milestone markers: color-coded diamond markers with vertical dashed lines at target dates",
          "Activity 'starts at milestone' constraint: activities can be pinned to start on a milestone's target date",
          "Milestone-aware deterministic scheduling: startsAtMilestoneId constraint in dependency forward pass",
          "Scenario cloning preserves and remaps milestone IDs and activity milestone references",
        ],
      },
      {
        title: "Global Calendar",
        items: [
          "Company-wide holiday calendar that applies to all projects (e.g., US federal holidays)",
          "Per-project calendars remain for project-specific non-work days (e.g., team offsite, vendor shutdown)",
          "Global and per-project calendars are merged at schedule computation time",
          "Calendar page redesigned with two sections: Company Holidays and Project-Specific Non-Work Days",
        ],
      },
      {
        title: "Gantt Chart",
        items: [
          "Dependency arrows use cubic B\u00e9zier curves with shorter horizontal stubs for cleaner routing",
          "Overlap case arrows route with a flatter descent and connect to arrowheads from the left",
          "Milestone markers rendered as color-coded diamonds with vertical dashed lines at target dates",
        ],
      },
      {
        title: "User Interface",
        items: [
          "Collapsible Milestones and Dependencies sections matching the Gantt chart toggle pattern",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema v8: Added milestones array to scenarios, milestoneId and startsAtMilestoneId to activities",
          "Automatic migration from v7 to v8 adds empty milestones array to existing scenarios",
        ],
      },
      {
        title: "Quality",
        items: [
          "471 automated tests across 33 test files",
        ],
      },
    ],
  },
  {
    version: "0.10.1",
    date: "2026-03-07",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed Gantt chart not resizing when dependencies change \u2014 chart now defensively scans all scheduled activity end dates",
          "Fixed negative lag (lead time) having no effect \u2014 addWorkingDays ignored negative offsets, now uses subtractWorkingDays for lead time",
        ],
      },
      {
        title: "UX Improvements",
        items: [
          "Lag input field clears on focus (placeholder \"0\" instead of hard-to-select value), commits on blur or Enter",
          "Negative lag values fully supported in the UI for lead time scheduling",
        ],
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-03-06",
    sections: [
      {
        title: "Gantt Chart",
        items: [
          "Interactive Gantt chart with dependency arrows, activity bars, and schedule buffer visualization",
          "Deterministic and With Uncertainty toggle showing per-activity uncertainty ranges",
          "Green dashed finish line at the buffered project end date with long-form date label",
          "Dependency arrows render behind activity bars for clean visual z-ordering",
          "Copy Gantt chart to clipboard as PNG image",
          "Range-adaptive time axis: daily, weekly, biweekly, or monthly ticks based on project duration",
          "Print-optimized Gantt chart in the printable report",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Extracted shared Gantt constants and utilities into gantt-constants.ts and gantt-utils.ts",
          "Eliminated code duplication between interactive and print Gantt charts",
          "GanttChart.tsx reduced from 767 to ~625 LOC via shared module extraction",
          "PrintableReport.tsx reduced from 491 to ~455 LOC by using shared utilities",
          "Added GanttChart to barrel export in charts/index.ts",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fixed html2canvas crash on Tailwind CSS v4 oklch() color functions during chart copy",
          "Fixed undefined variable (fromX) in Gantt lag label positioning",
          "Fixed two prefer-const lint errors in deterministic.ts and UnifiedActivityRow.tsx",
        ],
      },
      {
        title: "Security",
        items: [
          "Resolved 3 npm audit vulnerabilities (rollup path traversal, minimatch ReDoS, ajv ReDoS)",
        ],
      },
      {
        title: "Quality",
        items: [
          "452 automated tests across 33 test files",
          "22 new unit tests for Gantt utility functions (dateToX, generateTicks, buildOrderedActivities, etc.)",
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-03-06",
    sections: [
      {
        title: "Activity Dependencies",
        items: [
          "Opt-in dependency mode per scenario \u2014 toggle in the Scenario Summary Card",
          "Finish-to-Start (FS) dependencies with optional lag days (negative lag for lead time)",
          "Dependency Panel with add form, inline lag editing, and one-click removal",
          "Cycle prevention: the add form validates with real-time cycle detection before allowing new dependencies",
          "Duplicate prevention: cannot add the same predecessor\u2192successor relationship twice",
        ],
      },
      {
        title: "Dependency-Aware Scheduling",
        items: [
          "Topological sort (Kahn's algorithm) determines correct execution order",
          "Critical path method computes project duration accounting for parallelism",
          "Activities with no predecessors start in parallel on the project start date",
          "Deterministic schedule respects dependency constraints and lag days",
          "Monte Carlo simulation uses critical path per trial instead of flat summation",
          "Schedule buffer formula preserved: MC percentile at project target minus critical path duration",
        ],
      },
      {
        title: "Backward Compatibility",
        items: [
          "Dependencies toggle defaults to OFF \u2014 existing projects behave identically",
          "Toggling mode off preserves dependencies (not deleted), reverts to sequential schedule",
          "Schema version 7 with automatic v6\u2192v7 migration (adds dependencies array and mode flag)",
          "Dependencies survive export/import and scenario cloning (IDs remapped correctly)",
          "Deleting an activity automatically cleans up all its dependencies",
        ],
      },
      {
        title: "Settings & Printing",
        items: [
          "\"Enable Dependencies by Default\" preference in Settings page",
          "Printable report includes Dependencies section when dependency mode is on",
        ],
      },
      {
        title: "Quality",
        items: [
          "425 automated tests across 32 test files",
          "38 dependency graph algorithm tests including property-based tests with fast-check",
          "9 integration tests covering full dependency lifecycle and round-trip scenarios",
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-03-06",
    sections: [
      {
        title: "Heuristic Estimation",
        items: [
          "Heuristic toggle auto-calculates min/max from Most Likely using configurable percentages (default 50%/200%)",
          "New activity defaults reflect heuristic when enabled (e.g., min=0.5, ML=1, max=2 for 50%/200%)",
          "Manual overrides persist \u2014 heuristic only recalculates when Most Likely value actually changes",
          "Min/max fields remain clickable for direct override even when heuristic is enabled",
          "Per-scenario heuristic toggle with global default in Settings",
          "Schema version 6 with heuristic settings (min%, max%, enabled) per scenario",
        ],
      },
      {
        title: "Keyboard Navigation",
        items: [
          "Heuristic tab order: Name \u2192 ML \u2192 Confidence \u2192 Distribution \u2192 Status \u2192 Add Activity (skips min/max)",
          "Tab from min/max fields navigates logically to adjacent columns even in heuristic mode",
          "Add Activity button shows blue focus state when tabbed to (no longer appears disabled)",
        ],
      },
      {
        title: "Confidence Dropdown",
        items: [
          "Type-ahead filter: start typing to narrow the confidence level list (e.g., 'L' filters to Low)",
          "Arrow key navigation: use Up/Down to highlight options, Enter to select",
          "Highlighted option auto-scrolls into view in the dropdown list",
        ],
      },
      {
        title: "Quality",
        items: [
          "356 automated tests across 30 test files",
        ],
      },
    ],
  },
  {
    version: "0.7.1",
    date: "2026-02-04",
    sections: [
      {
        title: "User Interface",
        items: [
          "Removed breadcrumbs from project page to reduce whitespace",
          "Replaced lock/unlock emoji with cross-platform SVG padlock icons",
        ],
      },
      {
        title: "Charts & Visualization",
        items: [
          "Histogram excludes extreme outliers beyond P99 for a clearer distribution shape",
          "Chart copy-to-clipboard replaces file download (paste directly into Word, PowerPoint, Slack, etc.)",
          "Copy button shows stateful feedback: spinner while copying, green checkmark on success, red X on error",
          "Histogram reference line labels auto-offset when Mean and Percentile values are close together",
          "Reference line labels color-coded to match their lines (red for Mean, green for Percentile)",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fixed print/PDF export rendering a blank page",
          "Print report columns now match the web form order and include the duration column",
        ],
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-02-03",
    sections: [
      {
        title: "Scenario Management",
        items: [
          "Scenario lock/unlock feature to protect schedules from accidental edits",
          "Lock indicator banner and disabled inputs when scenario is locked",
          "Lock toggle accessible from scenario tabs (hover to reveal lock icon)",
          "Lock state persisted and included in export/import",
          "Schema version 5 with locked scenario support",
        ],
      },
      {
        title: "Code Quality",
        items: [
          "Refactored lock guard pattern into reusable helper function (8 instances consolidated)",
          "Added findScenario and isLocked helper utilities for cleaner store code",
          "Expanded test coverage: 343 automated tests across 29 test files",
          "Migration edge case tests for v4\u2192v5 schema upgrade",
        ],
      },
    ],
  },
  {
    version: "0.6.2",
    date: "2026-02-03",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix confidence dropdown being clipped on bottom activity rows (now renders via portal)",
        ],
      },
    ],
  },
  {
    version: "0.6.1",
    date: "2026-02-03",
    sections: [
      {
        title: "User Interface",
        items: [
          "Remove distracting up/down spinner arrows from number input fields (min, ml, max, actual)",
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-02-03",
    sections: [
      {
        title: "Storage Optimization",
        items: [
          "User preference to control simulation data storage (saves ~90% space when disabled)",
          "Storage usage display in Settings showing current localStorage consumption",
          "Export option to include/exclude simulation results (checkbox, unchecked by default)",
          "328 automated tests across 29 test files",
        ],
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-02-03",
    sections: [
      {
        title: "User Experience",
        items: [
          "Dark mode support with system preference detection and manual toggle",
          "Toast notification system for user feedback (success, error, info)",
          "Keyboard shortcuts help modal (press ? to view)",
          "Print-optimized project report (browser print with dedicated layout)",
          "Copy RNG seed to clipboard button",
          "Reset preferences to defaults button in Settings",
        ],
      },
      {
        title: "Activity Management",
        items: [
          "Activity row duplication with one-click copy",
          "Batch operations: bulk set confidence level, distribution type, or delete selected activities",
          "Inline distribution sparkline charts (hover to preview distribution shape)",
          "Variance tracking: shows actual vs estimated difference when activities complete",
        ],
      },
      {
        title: "Analysis & Visualization",
        items: [
          "Sensitivity analysis panel ranking activities by impact on project uncertainty",
          "Bootstrap confidence intervals on percentiles (toggle 'Show 95% CI' in percentile table)",
          "CDF comparison chart overlay when comparing 2-3 scenarios",
          "Chart export as PNG (histogram and CDF charts)",
        ],
      },
      {
        title: "Data Management",
        items: [
          "Project archival: archive/unarchive projects with filter toggle on projects page",
          "Preferences included in export/import (optional, backward compatible)",
          "Schema version 4 with archived project support",
        ],
      },
      {
        title: "Technical",
        items: [
          "html2canvas integration for chart PNG export",
          "321 automated tests across 29 test files",
        ],
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-02-03",
    sections: [
      {
        title: "Security Hardening",
        items: [
          "React Error Boundary for graceful error recovery",
          "Calendar iteration guards prevent infinite loops with pathological data",
          "Web Worker message validation (defense-in-depth)",
          "Simulation payload validation before processing",
          "Chart data NaN/Infinity guards",
          "Explicit source map disabling in production builds",
          "SECURITY.md with deployment recommendations and security headers",
        ],
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-02-02",
    sections: [
      {
        title: "Dependency Upgrades",
        items: [
          "React 18.3 \u2192 19.2 (latest stable)",
          "Vite 6 \u2192 7 with @vitejs/plugin-react 5",
          "TypeScript 5.7 \u2192 5.9",
          "Zod 3 \u2192 4 (schema validation)",
          "Recharts 2 \u2192 3 (charting library)",
          "Vitest 2 \u2192 4, fast-check 3 \u2192 4 (testing infrastructure)",
          "ESLint 9.18 \u2192 9.39, eslint-plugin-react-hooks 5 \u2192 7",
          "Tailwind CSS 4.0 \u2192 4.1, React Router 7.1 \u2192 7.13",
          "All remaining dependencies updated to latest stable versions",
        ],
      },
      {
        title: "Security & Quality",
        items: [
          "Zero known vulnerabilities for JFrog scan compliance",
          "All 314 automated tests passing on upgraded toolchain",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-02-01",
    sections: [
      {
        title: "User Preferences",
        items: [
          "Configurable defaults for trial count, distribution type, confidence level, activity target, and project target",
          "Date format preference (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD) applied globally across all views",
          "Auto-run simulation toggle with 500ms debounce \u2014 simulation re-runs automatically when activities or settings change",
          "Preferences stored separately in localStorage, independent of project data",
        ],
      },
      {
        title: "Data Entry & Editing",
        items: [
          "Tab navigation flows between estimate fields (Min \u2192 ML \u2192 Max) across activity rows",
          "Inline editing for project names and scenario names (double-click to rename)",
          "Activity grid summary row showing totals for Min, ML, Max, and scheduled duration",
          "Bulk select and mark-complete for multiple activities at once",
          "Confidence level dropdown with RSM descriptions for each of the 10 levels",
        ],
      },
      {
        title: "Simulation & Analysis",
        items: [
          "Confidence band visualization on histogram (shaded region between activity and project percentiles)",
          "Export simulation results as CSV with metadata, summary statistics, and percentile table",
          "Scenario comparison table for 2\u20133 scenarios with side-by-side metrics and best-value highlighting",
        ],
      },
      {
        title: "Navigation & Polish",
        items: [
          "Breadcrumb navigation on the project page",
          "Project search/filter on the projects page",
          "Undo/redo support (Ctrl+Z / Ctrl+Shift+Z) with 50-entry stack for all project mutations",
          "Validation error summary panel above the activity grid",
          "US federal holiday presets (12 holidays) with year selector in the calendar editor",
        ],
      },
      {
        title: "Refactoring & Quality",
        items: [
          "Centralized download helper and distribution/status label formatters for DRY code",
          "Memoized schedule lookup map in the activity grid for render performance",
          "Consistent date formatting across all views via the useDateFormat hook",
          "314 automated tests across 29 test files (up from 280 in v0.1.0)",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-01-31",
    sections: [
      {
        title: "Core Engine",
        items: [
          "SPERT three-point estimation with 10-level Ratio Scale Modifier (RSM) confidence mapping",
          "T-Normal, LogNormal, Triangular, and Uniform distribution strategies with automatic recommendation engine",
          "Deterministic schedule engine with configurable activity-level probability target (default P50)",
          "Monte Carlo simulation engine (50,000 trials default) running in a Web Worker for non-blocking UI",
          "Parkinson's Law modeling: simulated activity durations are clamped to at least the deterministic (scheduled) duration",
          "Schedule buffer calculation: project-level Monte Carlo percentile minus deterministic total",
          "Holiday-aware Monday\u2013Friday calendar with working day arithmetic",
          "Seeded PRNG (ARC4 via seedrandom) for reproducible simulation results",
        ],
      },
      {
        title: "User Interface",
        items: [
          "Unified activity grid merging input fields with computed schedule (dates, durations, source badges)",
          "Scenario summary card with Start, Finish w/o Buffer, Duration, Finish w/Buffer, and Duration w/Buffer",
          "Dual probability targets: Activity Target (deterministic schedule) and Project Target (MC confidence / buffer)",
          "Histogram, CDF chart, and percentile table for simulation results",
          "Scenario tabs with add, clone (with option to drop completed activities), and delete",
          "Activity reorder via drag-and-drop with grip handles",
          "All dates displayed in MM/DD/YYYY format (stored internally as YYYY-MM-DD)",
          "Blue-highlighted date values in the summary card for quick scanning",
        ],
      },
      {
        title: "Data & Persistence",
        items: [
          "All data stored locally in browser localStorage \u2014 no server, no analytics, no telemetry",
          "Schema-versioned persistence with sequential migration system (v1 \u2192 v2 \u2192 v3)",
          "Zod runtime validation on every load for data integrity",
          "Project and scenario CRUD with global calendar overrides",
          "JSON export/import with schema migration and conflict resolution (skip, replace, import as copy)",
        ],
      },
      {
        title: "Architecture",
        items: [
          "Strict layered architecture: Domain \u2192 Core \u2192 Infrastructure \u2192 Application \u2192 UI",
          "Core scheduling math is framework-agnostic (zero React/DOM dependencies)",
          "TypeScript strict mode with zero type errors",
          "Production build under 42 KB gzipped (excluding charts library)",
        ],
      },
    ],
  },
];
