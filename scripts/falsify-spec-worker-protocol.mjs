// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the Worker PROTOCOL oracle (§3.5). The MC oracle was falsified by
// perturbing each sample() site; the analogue here is mutating each branch's OUTPUT —
// change a posted field, swap a message type, drop a message, weaken a guard — and require
// a NAMED fixture to fail for each.
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
    find: `      postError("Invalid simulation payload: rngSeed must be a non-empty string");`,
    replace: `      postError("Invalid simulation payload: bad seed");`,
    expectFailing: /seed-empty/,
  },
  {
    id: "W4  trialCount lower bound moved off 1000",
    file: W,
    find: `      payload.trialCount < 1000 ||`,
    replace: `      payload.trialCount < 999 ||`,
    expectFailing: /trialcount-too-low|error fixtures actually error/,
  },
  {
    id: "W5  the constraint TYPE check is removed from the vocabulary guard",
    file: W,
    find: `            VALID_SEQ_TYPES.includes(c.type) &&`,
    replace: ``,
    expectFailing: /rejected-as-invalid|matches the pinned exchange/,
  },
  {
    id: "W6  the offsetFromStart typeof check is removed",
    file: W,
    find: `            typeof c.offsetFromStart === "number" &&`,
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
    find: `      if (milestoneResults) {\n        result.milestoneResults = milestoneResults;\n      }`,
    replace: `      if (false && milestoneResults) {\n        result.milestoneResults = milestoneResults;\n      }`,
    expectFailing: /with-milestones/,
  },
  {
    id: "W9  the activities-array validation is bypassed",
    file: W,
    find: `    if (!payload || !Array.isArray(payload.activities)) {`,
    replace: `    if (!payload) {`,
    expectFailing: /activities-missing|error fixtures actually error/,
  },
  {
    id: "W10 an unknown message type is no longer ignored",
    file: W,
    find: `  if (type === "simulation:start") {`,
    replace: `  if (type === "simulation:start" || true) {`,
    expectFailing: /silently-ignored|error fixtures actually error/,
  },
];
