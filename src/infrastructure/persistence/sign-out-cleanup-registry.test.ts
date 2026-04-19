// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerSignOutCleanup,
  clearSignOutCleanup,
  runSignOutCleanup,
} from "./sign-out-cleanup-registry";

describe("sign-out-cleanup-registry", () => {
  beforeEach(() => {
    clearSignOutCleanup();
  });

  afterEach(() => {
    clearSignOutCleanup();
  });

  it("invokes the registered function exactly once per run", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    registerSignOutCleanup(fn);

    await runSignOutCleanup();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("last-registration-wins when register is called twice", async () => {
    const fnA = vi.fn().mockResolvedValue(undefined);
    const fnB = vi.fn().mockResolvedValue(undefined);

    registerSignOutCleanup(fnA);
    registerSignOutCleanup(fnB);

    await runSignOutCleanup();

    expect(fnA).not.toHaveBeenCalled();
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing is registered", async () => {
    await expect(runSignOutCleanup()).resolves.toBeUndefined();
  });

  it("clearSignOutCleanup makes subsequent runs a no-op", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    registerSignOutCleanup(fn);
    clearSignOutCleanup();

    await runSignOutCleanup();

    expect(fn).not.toHaveBeenCalled();
  });

  it("swallows and logs errors thrown by the registered function", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    registerSignOutCleanup(async () => {
      throw new Error("boom");
    });

    await expect(runSignOutCleanup()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("awaits the registered function before resolving", async () => {
    const order: string[] = [];
    registerSignOutCleanup(async () => {
      order.push("start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("end");
    });

    await runSignOutCleanup();
    order.push("after");

    expect(order).toEqual(["start", "end", "after"]);
  });
});
