// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSimulation } from "./use-simulation";
import { runSimulation } from "@app/api/simulation-service";
import type { Activity, SimulationRun } from "@domain/models/types";

vi.mock("@app/api/simulation-service", () => ({ runSimulation: vi.fn() }));

/**
 * At 0% coverage before charter §3.2, and classified Tier 2 by the dependency survey —
 * "the Web Worker client". That turned out to OVERSTATE the coupling, which is worth
 * recording as precisely as the cases that did resist.
 *
 * The Worker never appears here. It is already abstracted behind `runSimulation` in the
 * app layer, so this hook's only obstacle is that the import is not injected — one
 * `vi.mock` and it is an ordinary state machine. **Module-import coupling, not Worker
 * coupling**, and the two need different remedies: this one needs nothing structural,
 * whereas `use-storage-mode-switch`'s six collaborators need decomposition.
 *
 * What the hook actually owns is the state machine and the handle lifecycle — in
 * particular, that the handle is dropped on every terminal transition so `cancel()` after
 * completion cannot reach a dead Worker.
 */

const mockRun = vi.mocked(runSimulation);

const activity = (id: string): Activity =>
  ({
    id,
    name: id,
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
  }) as Activity;

const ACTS = [activity("a1")];
const RESULT = { percentiles: { 95: 20 } } as unknown as SimulationRun;

type Callbacks = {
  onProgress: (completed: number, total: number) => void;
  onComplete: (result: SimulationRun, elapsedMs: number) => void;
  onError: (message: string) => void;
};

/** Captures the callbacks the hook hands to runSimulation, so they can be driven. */
let captured: Callbacks | null = null;
let cancelSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  captured = null;
  cancelSpy = vi.fn();
  mockRun.mockReset();
  mockRun.mockImplementation(((
    _a: unknown,
    _t: unknown,
    _s: unknown,
    _d: unknown,
    cbs: Callbacks,
  ) => {
    captured = cbs;
    return { cancel: cancelSpy };
  }) as unknown as typeof runSimulation);
});

const start = (onComplete = vi.fn()) => {
  const hook = renderHook(() => useSimulation());
  act(() => {
    hook.result.current.run(ACTS, 5000, "seed-1", undefined, onComplete);
  });
  return { hook, onComplete };
};

describe("useSimulation", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useSimulation());
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.elapsedMs).toBeNull();
  });

  describe("run", () => {
    it("marks the run in progress and forwards its arguments", () => {
      const { hook } = start();
      expect(hook.result.current.isRunning).toBe(true);
      expect(mockRun).toHaveBeenCalledTimes(1);
      expect(mockRun.mock.calls[0]!.slice(0, 4)).toEqual([ACTS, 5000, "seed-1", undefined]);
    });

    it("clears a previous error when a new run starts", () => {
      const { hook } = start();
      act(() => captured!.onError("first failed"));
      expect(hook.result.current.error).toBe("first failed");

      act(() => {
        hook.result.current.run(ACTS, 5000, "seed-2", undefined, vi.fn());
      });
      expect(hook.result.current.error).toBeNull();
      expect(hook.result.current.isRunning).toBe(true);
    });
  });

  describe("progress", () => {
    it("reports completed and total without leaving the running state", () => {
      const { hook } = start();
      act(() => captured!.onProgress(2000, 5000));
      expect(hook.result.current.progress).toEqual({ completed: 2000, total: 5000 });
      expect(hook.result.current.isRunning).toBe(true);
    });

    it("overwrites earlier progress rather than accumulating", () => {
      const { hook } = start();
      act(() => captured!.onProgress(1000, 5000));
      act(() => captured!.onProgress(4000, 5000));
      expect(hook.result.current.progress).toEqual({ completed: 4000, total: 5000 });
    });
  });

  describe("completion", () => {
    it("hands the result to the caller and records elapsed time", () => {
      const { hook, onComplete } = start();
      act(() => captured!.onComplete(RESULT, 1234));

      expect(onComplete).toHaveBeenCalledWith(RESULT, 1234);
      expect(hook.result.current.isRunning).toBe(false);
      expect(hook.result.current.elapsedMs).toBe(1234);
      expect(hook.result.current.error).toBeNull();
    });

    it("clears progress so a finished run does not show a stale bar", () => {
      const { hook } = start();
      act(() => captured!.onProgress(4000, 5000));
      act(() => captured!.onComplete(RESULT, 10));
      expect(hook.result.current.progress).toBeNull();
    });

    it("drops the handle, so a later cancel cannot reach a finished run", () => {
      // The handle lifecycle is the part of this hook that is easy to get wrong: without
      // the `handleRef.current = null` in onComplete, a cancel click after the run
      // finished would call into a Worker that is already terminated.
      const { hook } = start();
      act(() => captured!.onComplete(RESULT, 10));
      act(() => hook.result.current.cancel());
      expect(cancelSpy).not.toHaveBeenCalled();
    });
  });

  describe("failure", () => {
    it("surfaces the message and stops running", () => {
      const { hook, onComplete } = start();
      act(() => captured!.onError("worker exploded"));

      expect(hook.result.current.error).toBe("worker exploded");
      expect(hook.result.current.isRunning).toBe(false);
      expect(hook.result.current.elapsedMs).toBeNull();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("drops the handle on failure too", () => {
      const { hook } = start();
      act(() => captured!.onError("worker exploded"));
      act(() => hook.result.current.cancel());
      expect(cancelSpy).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    it("cancels an in-flight run and resets to idle", () => {
      const { hook } = start();
      act(() => captured!.onProgress(1000, 5000));

      act(() => hook.result.current.cancel());

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(hook.result.current.isRunning).toBe(false);
      expect(hook.result.current.progress).toBeNull();
      expect(hook.result.current.error).toBeNull();
    });

    it("is safe with no run in flight", () => {
      const { result } = renderHook(() => useSimulation());
      expect(() => act(() => result.current.cancel())).not.toThrow();
      expect(cancelSpy).not.toHaveBeenCalled();
    });

    it("clears a previous error", () => {
      const { hook } = start();
      act(() => captured!.onError("boom"));
      act(() => hook.result.current.cancel());
      expect(hook.result.current.error).toBeNull();
    });
  });
});
