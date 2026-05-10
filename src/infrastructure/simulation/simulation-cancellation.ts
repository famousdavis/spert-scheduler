// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Module-level generation counter used to discard simulation results that
 * arrive after sign-out. v0.42.6 (M2) — closes a race where a simulation
 * started before sign-out posts back after the cleanup registry has already
 * zeroed the store, potentially writing a stale aggregate into the next
 * user's project (improbable UUID collision required, but possible via
 * shared templates / imports).
 *
 * Pattern (Option C from the v0.42.6 audit, refined per Claude Chat):
 *   - Each onComplete callback that writes to `setSimulationResults`
 *     captures the current generation at call-site time.
 *   - On sign-out, the cleanup registry calls `bumpSimulationGeneration()`,
 *     incrementing the counter.
 *   - When the worker eventually posts back, the captured generation no
 *     longer matches `currentSimulationGeneration()` and the callback
 *     short-circuits before touching the store.
 *
 * The worker itself is NOT terminated. Terminating mid-run can leave the
 * worker in an unrecoverable state if it's reused. Discarding the result
 * downstream is functionally equivalent and structurally safer.
 *
 * Multiple concurrent runs work correctly because each onComplete captures
 * its own snapshot of the counter — a single bump invalidates all of them
 * simultaneously, which is exactly the desired sign-out semantics.
 */

let generation = 0;

/**
 * Returns the current simulation generation. Capture this at the start of
 * any work that ends with a `setSimulationResults` write, then compare
 * against the live value before writing.
 */
export function currentSimulationGeneration(): number {
  return generation;
}

/**
 * Increment the generation counter. All in-flight simulation onComplete
 * callbacks that captured the previous value will now short-circuit.
 * Called from the sign-out cleanup registry.
 */
export function bumpSimulationGeneration(): void {
  generation++;
}

/**
 * Test-only: reset to zero. Production code never calls this — bumping is
 * additive and the counter wraps at Number.MAX_SAFE_INTEGER (effectively
 * never reachable).
 */
export function _resetSimulationGenerationForTests(): void {
  generation = 0;
}
