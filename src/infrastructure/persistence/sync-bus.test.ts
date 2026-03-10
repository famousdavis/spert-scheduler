// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from "vitest";
import { cloudSyncBus } from "./sync-bus";
import type { SyncEvent } from "./sync-bus";

describe("SyncBus", () => {
  it("emitSave notifies subscribers with correct event", () => {
    const handler = vi.fn();
    const unsub = cloudSyncBus.subscribe(handler);

    cloudSyncBus.emitSave("project-1");

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "save",
      projectId: "project-1",
    } satisfies SyncEvent);

    unsub();
  });

  it("emitCreate notifies subscribers with correct event", () => {
    const handler = vi.fn();
    const unsub = cloudSyncBus.subscribe(handler);

    cloudSyncBus.emitCreate("project-2");

    expect(handler).toHaveBeenCalledWith({
      type: "create",
      projectId: "project-2",
    } satisfies SyncEvent);

    unsub();
  });

  it("emitDelete notifies subscribers with correct event", () => {
    const handler = vi.fn();
    const unsub = cloudSyncBus.subscribe(handler);

    cloudSyncBus.emitDelete("project-3");

    expect(handler).toHaveBeenCalledWith({
      type: "delete",
      projectId: "project-3",
    } satisfies SyncEvent);

    unsub();
  });

  it("unsubscribe prevents further notifications", () => {
    const handler = vi.fn();
    const unsub = cloudSyncBus.subscribe(handler);

    cloudSyncBus.emitSave("project-1");
    expect(handler).toHaveBeenCalledOnce();

    unsub();

    cloudSyncBus.emitSave("project-2");
    expect(handler).toHaveBeenCalledOnce(); // still 1
  });

  it("emitting with no subscribers is a no-op", () => {
    // Should not throw
    cloudSyncBus.emitSave("orphan-project");
    cloudSyncBus.emitCreate("orphan-project");
    cloudSyncBus.emitDelete("orphan-project");
  });

  it("supports multiple subscribers", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = cloudSyncBus.subscribe(handler1);
    const unsub2 = cloudSyncBus.subscribe(handler2);

    cloudSyncBus.emitSave("project-1");

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();

    unsub1();
    unsub2();
  });

  it("removing one subscriber does not affect others", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = cloudSyncBus.subscribe(handler1);
    const unsub2 = cloudSyncBus.subscribe(handler2);

    unsub1();

    cloudSyncBus.emitSave("project-1");

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();

    unsub2();
  });
});
