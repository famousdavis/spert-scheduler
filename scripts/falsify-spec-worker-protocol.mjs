// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the Worker PROTOCOL oracle (§3.5). The MC oracle was falsified by
// perturbing each sample() site; the analogue here is mutating each branch's OUTPUT —
// change a posted field, swap a message type, drop a message, weaken a guard — and require
// a NAMED fixture to fail for each.
//
// ── RE-POINTED AT THE DECOMPOSED WORKER (§3.5 Step 4) ─────────────────────────────────
// Seven of the ten original needles addressed lines that Step 4 moved or re-indented. A
// needle that no longer matches does NOT silently no-op — `checkNeedleUnique` aborts — but
// an aborting spec is an unfalsified guard, which is the state this whole campaign treats
// as worse than no guard at all. So they are re-pointed here, in the same commit as the
// decomposition.
//
// W11–W13 are NEW, and they are the point: a decomposition does not merely move code, it
// creates JOINTS that did not exist before. The handler now delegates branch selection,
// validation and map-building across function boundaries, and each of those calls is a
// place a future edit can go wrong in a way the old monolith could not. Re-pointing the old
// needles proves nothing about them.
const W = new URL("../src/workers/simulation.worker.ts", import.meta.url).pathname;
export const testFile = "src/integration/simulation-worker-protocol-oracle.test.ts";
export const mutations = [
  {
    id: "W1  postResult drops elapsedMs",
    file: W,
    find: `    payload: { ...result, elapsedMs },`,
    replace: `    payload: { ...result },`,
    expectFailing: /matches the pinned exchange/,
  },
  {
    id: "W2  postProgress reports the wrong completed count",
    file: W,
    find: `    payload: { completedTrials, totalTrials },`,
    replace: `    payload: { completedTrials: completedTrials + 1, totalTrials },`,
    expectFailing: /progress-reported/,
  },
  {
    id: "W3  an error message string is reworded",
    file: W,
    find: `    return "Invalid simulation payload: rngSeed must be a non-empty string";`,
    replace: `    return "Invalid simulation payload: bad seed";`,
    expectFailing: /seed-empty/,
  },
  {
    id: "W4  trialCount lower bound moved off 1000",
    file: W,
    find: `    payload.trialCount < 1000 ||`,
    replace: `    payload.trialCount < 999 ||`,
    expectFailing: /trialcount-too-low|error fixtures actually error/,
  },
  {
    id: "W5  the constraint TYPE check is removed from the vocabulary guard",
    file: W,
    find: `      VALID_SEQ_TYPES.includes(c.type) &&`,
    replace: ``,
    expectFailing: /rejected-as-invalid|matches the pinned exchange/,
  },
  {
    id: "W6  the offsetFromStart typeof check is removed",
    file: W,
    find: `      typeof c.offsetFromStart === "number" &&`,
    replace: ``,
    expectFailing: /rejected-as-invalid|matches the pinned exchange/,
  },
  {
    id: "W7  a result is posted as a progress message",
    file: W,
    find: `    type: "simulation:result",`,
    replace: `    type: "simulation:progress",`,
    expectFailing: /matches the pinned exchange|actually reach BOTH engines/,
  },
  {
    id: "W8  milestoneResults never attached",
    file: W,
    find: `    if (outcome.milestoneResults) {\n      result.milestoneResults = outcome.milestoneResults;\n    }`,
    replace: `    if (false && outcome.milestoneResults) {\n      result.milestoneResults = outcome.milestoneResults;\n    }`,
    expectFailing: /with-milestones/,
  },
  {
    id: "W9  the activities-array validation is bypassed",
    file: W,
    find: `  if (!payload || !Array.isArray(payload.activities)) {`,
    replace: `  if (!payload) {`,
    expectFailing: /activities-missing|error fixtures actually error/,
  },
  {
    id: "W10 an unknown message type is no longer ignored",
    file: W,
    find: `  if (type !== "simulation:start") return;`,
    replace: `  if (type !== "simulation:start" && false) return;`,
    expectFailing: /silently-ignored|error fixtures actually error/,
  },

  // ── the joints Step 4 created ───────────────────────────────────────────────────────
  {
    // The handler no longer decides the branch inline; it calls one of two functions. A
    // mis-wired selector is a whole-run behaviour change that did not previously have a
    // place to hide.
    //
    // ⚠️ Only the milestone fixture catches this, and that is a MEASURED result, not a
    // guess — `dependency/plain` and `dependency/constraints-no-milestones` pin structural
    // facts (17 percentiles, all finite) that the sequential engine also satisfies. See
    // the note on the premise test in the §3.5 Step 4 mutation record.
    id: "W11 the dependency branch is routed to the sequential engine",
    file: W,
    find: `        ? runDependencyBranch(payload, payload.dependencies)`,
    replace: `        ? runSequentialBranch(payload)`,
    expectFailing: /with-milestones/,
  },
  {
    // validateStartPayload now RETURNS its verdict instead of posting it, so for the first
    // time the handler can compute the right answer and then ignore it. There was no such
    // failure mode when the checks posted and returned inline.
    id: "W12 the handler ignores the validator's verdict",
    file: W,
    find: `  if (invalid !== null) {`,
    replace: `  if (false) {`,
    expectFailing: /error fixtures actually error|error\/activities-missing/,
  },
  {
    // toValidatedMap replaced three open-coded conversions. If it returns nothing, the
    // dependency engine silently loses its milestone assignment and Parkinson floors —
    // exactly the "engine silently ignores them" failure this marshalling exists to
    // prevent, per simulation.worker.test.ts's Record→Map test.
    id: "W13 toValidatedMap builds no map at all",
    file: W,
    find: `    ? new Map(Object.entries(source).filter(([, value]) => isValid(value)))`,
    replace: `    ? undefined`,
    expectFailing: /with-milestones/,
  },
];
