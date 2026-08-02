// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  SimulationRequest,
  SimulationProgress,
  SimulationResult,
  SimulationError,
} from "@core/simulation/worker-protocol";
import type {
  ActivityDependency,
  ConstraintMode,
  ConstraintType,
  SimulationRun,
} from "@domain/models/types";
import { CONSTRAINT_MODES, CONSTRAINT_TYPES } from "@domain/models/types";
import { runTrials, runDependencyTrials, computeSimulationStats, computeMilestoneStats } from "@core/simulation/monte-carlo";
import { toMcConstraintMap } from "@core/schedule/constraint-utils";

const PROGRESS_INTERVAL = 10000;

type StartPayload = SimulationRequest["payload"];

/**
 * What either engine branch hands back.
 *
 * ⚠️ `exhaustedIds` is REQUIRED here deliberately. It used to be a `let` initialised to `[]`
 * in the handler, carrying a comment noting that the engine's param is optional so the
 * sequential branch's threading "is NOT forced by the type-checker — this is the default
 * production path, so it must be wired explicitly". Making it a required field is what
 * forces it: a branch that forgets to return it is now a compile error rather than a
 * silently-empty array. The dedicated test that covered the gap stays where it is.
 */
interface TrialOutcome {
  samples: Float64Array;
  exhaustedIds: string[];
  /** Set only by the dependency branch, and only when the run carried milestones. */
  milestoneResults?: NonNullable<SimulationRun["milestoneResults"]>;
}

function postProgress(completedTrials: number, totalTrials: number) {
  const msg: SimulationProgress = {
    type: "simulation:progress",
    payload: { completedTrials, totalTrials },
  };
  self.postMessage(msg);
}

function postResult(result: SimulationRun, elapsedMs: number) {
  const msg: SimulationResult = {
    type: "simulation:result",
    payload: { ...result, elapsedMs },
  };
  self.postMessage(msg);
}

function postError(message: string) {
  const msg: SimulationError = {
    type: "simulation:error",
    payload: { message },
  };
  self.postMessage(msg);
}

/**
 * Defence in depth: the UI should send only valid payloads, but this one crossed a
 * structured-clone boundary where the declared types are the sender's claim rather than a
 * guarantee.
 *
 * Returns the message to post, or `null` when the payload is usable. ⚠️ The ORDER of the
 * checks is load-bearing — the first to fail decides which string is posted, and the
 * protocol oracle pins all three by value.
 */
function validateStartPayload(payload: StartPayload): string | null {
  if (!payload || !Array.isArray(payload.activities)) {
    return "Invalid simulation payload: missing or invalid activities";
  }
  if (
    typeof payload.trialCount !== "number" ||
    payload.trialCount < 1000 ||
    payload.trialCount > 100000
  ) {
    return "Invalid simulation payload: trialCount must be between 1000 and 100000";
  }
  if (typeof payload.rngSeed !== "string" || payload.rngSeed.length === 0) {
    return "Invalid simulation payload: rngSeed must be a non-empty string";
  }
  return null;
}

const isNumber = (value: unknown): boolean => typeof value === "number";
const isStringArray = (value: unknown): boolean => Array.isArray(value);

/**
 * Rebuild a `Map` from a `Record` flattened by structured clone, dropping entries whose
 * RUNTIME type is wrong — same reasoning as `validateStartPayload`. Three call sites below
 * open-coded this with three near-identical inline type predicates.
 */
function toValidatedMap<T>(
  source: Record<string, T> | undefined,
  isValid: (value: unknown) => boolean,
): Map<string, T> | undefined {
  return source
    ? new Map(Object.entries(source).filter(([, value]) => isValid(value)))
    : undefined;
}

/** Dependency-aware simulation: critical path per trial. */
function runDependencyBranch(
  payload: StartPayload,
  dependencies: ActivityDependency[],
): TrialOutcome {
  const depResult = runDependencyTrials({
    activities: payload.activities,
    dependencies,
    trialCount: payload.trialCount,
    rngSeed: payload.rngSeed,
    deterministicDurationMap: toValidatedMap(payload.deterministicDurationMap, isNumber),
    milestoneActivityIds: toValidatedMap(payload.milestoneActivityIds, isStringArray),
    activityEarliestStart: toValidatedMap(payload.activityEarliestStart, isNumber),
    // Shared with the synchronous service path — see toMcConstraintMap.
    constraintMap: toMcConstraintMap(payload.constraintMap),
    onProgress: postProgress,
    progressInterval: PROGRESS_INTERVAL,
  });

  return {
    samples: depResult.samples,
    exhaustedIds: depResult.exhaustedIds,
    milestoneResults: depResult.milestoneSamples
      ? computeMilestoneStats(depResult.milestoneSamples, payload.trialCount)
      : undefined,
  };
}

/** One entry of the sequential-constraint array, as it arrives over `postMessage`. */
type SeqConstraintEntry = NonNullable<StartPayload["sequentialConstraints"]>[number];

/** The same entry once its type and mode are known to be in the domain vocabulary. */
interface ValidatedSeqConstraint {
  type: ConstraintType;
  offsetFromStart: number;
  mode: ConstraintMode;
}

/**
 * Membership test that NARROWS `string` to the tuple's literal union.
 *
 * ⚠️ `.some`, not `.includes`, and that is the entire point. `CONSTRAINT_TYPES` is `as const`,
 * so `CONSTRAINT_TYPES.includes(c.type)` does not compile — the parameter narrows to
 * `ConstraintType`, and a `string` is not assignable to it. The two obvious fixes are both
 * casts (widen the array to `readonly string[]`, or assert the value `as ConstraintType`), and
 * a cast here would silence precisely the check that makes this guard worth having. `.some`
 * compares `T` against `string`, which is legal, and the type predicate does the narrowing.
 */
function isOneOf<T extends string>(allowed: readonly T[], value: string): value is T {
  return allowed.some((entry) => entry === value);
}

/**
 * ⚠️ THE LAST HAND-MAINTAINED COPY OF THE CONSTRAINT VOCABULARY LIVED HERE, as
 * `VALID_SEQ_TYPES` / `VALID_SEQ_MODES`. It was diffed against `CONSTRAINT_TYPES` /
 * `CONSTRAINT_MODES` programmatically — identical members, identical order — before being
 * retired, so this is a cleanup and never was a defect.
 *
 * It was the *only* copy worth hunting: every other site in the app is a `switch` case or a
 * union-typed predicate that TypeScript checks, and a typo in one of those is a compile error.
 * `.includes()` on an unchecked `string[]` was the one shape free to drift silently.
 *
 * The narrowing is not decoration. `SequentialConstraintEntry` in the engine declares
 * `type: string` with a *comment* reading `// ConstraintType`; this predicate is what turns
 * that comment into something the compiler enforces, at the seam where untrusted
 * structured-clone data enters.
 */
function isValidSeqConstraint(c: SeqConstraintEntry): c is ValidatedSeqConstraint {
  return (
    c != null &&
    typeof c.offsetFromStart === "number" &&
    isOneOf(CONSTRAINT_TYPES, c.type) &&
    isOneOf(CONSTRAINT_MODES, c.mode)
  );
}

/** Sequential simulation, with optional constraint support. */
function runSequentialBranch(payload: StartPayload): TrialOutcome {
  const seqConstraints = payload.sequentialConstraints?.map((c) =>
    isValidSeqConstraint(c) ? c : null,
  );

  const trials = runTrials({
    activities: payload.activities,
    trialCount: payload.trialCount,
    rngSeed: payload.rngSeed,
    deterministicDurations: payload.deterministicDurations,
    sequentialConstraints: seqConstraints,
    onProgress: postProgress,
    progressInterval: PROGRESS_INTERVAL,
  });

  return { samples: trials.samples, exhaustedIds: trials.exhaustedIds };
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { type, payload } = event.data;
  // ⚠️ Any other message type is SILENTLY IGNORED — no error, no ack. Recorded, not
  // specified; pinned by the oracle's `unknown-message-type/silently-ignored` fixture.
  if (type !== "simulation:start") return;

  const invalid = validateStartPayload(payload);
  if (invalid !== null) {
    postError(invalid);
    return;
  }

  try {
    const startTime = performance.now();

    // ⚠️ Both engine calls must stay INSIDE the try. A throw escaping this handler surfaces
    // as an unhandled rejection inside a Worker, where nothing can report it and the UI
    // hangs forever — which is what the catch below exists to prevent.
    const outcome =
      payload.dependencyMode && payload.dependencies
        ? runDependencyBranch(payload, payload.dependencies)
        : runSequentialBranch(payload);

    const result = computeSimulationStats(
      outcome.samples,
      payload.trialCount,
      payload.rngSeed,
      outcome.exhaustedIds
    );

    if (outcome.milestoneResults) {
      result.milestoneResults = outcome.milestoneResults;
    }

    postResult(result, performance.now() - startTime);
  } catch (err) {
    postError(err instanceof Error ? err.message : String(err));
  }
};
