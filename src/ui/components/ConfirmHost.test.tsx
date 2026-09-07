// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `ConfirmHost` + the promise API end to end (WI-6a, v0.67.8).
 *
 * WARNING: nothing in the shipped app calls `confirmDialog.ask(...)` yet — WI-6a migrates no
 * call site, so `pending` is always null in production after this release. These tests drive
 * the mechanism directly so that it is pinned BEFORE WI-6b/c/d start leaning on it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { confirmDialog, useConfirmStore } from "@ui/hooks/use-confirm-store";
import { ConfirmHost } from "./ConfirmHost";

beforeEach(() => useConfirmStore.setState({ pending: null }));

function Asker({ act }: { act: (ok: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await confirmDialog.ask({
          title: "Delete?",
          description: "d",
          confirmLabel: "Delete",
        });
        act(ok); // the call site's continuation, closing over a component that may be gone
      }}
    >
      ask
    </button>
  );
}

function Page({ act }: { act: (ok: boolean) => void }) {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      {mounted && <Asker act={act} />}
      <button type="button" onClick={() => setMounted(false)}>
        navigate away
      </button>
      <ConfirmHost />
    </>
  );
}

describe("ask() round trip — PREDICTION: the awaited value is the button the user pressed", () => {
  it("resolves true on Confirm and false on Cancel, with the labels the caller supplied", async () => {
    const act = vi.fn();
    render(<Page act={act} />);

    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    await screen.findByRole("dialog"); // self-check: the host rendered the question
    fireEvent.click(screen.getByRole("button", { name: "Delete" })); // the caller's confirmLabel
    await waitFor(() => expect(act).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(act).toHaveBeenCalledWith(false));
  });

  it("Escape resolves false — the dismissal value, exactly once", async () => {
    const act = vi.fn();
    render(<Page act={act} />);
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(act).toHaveBeenCalledWith(false));
    expect(act).toHaveBeenCalledTimes(1);
  });
});

describe("the asker unmounts while its question is showing — PREDICTION: the dialog OUTLIVES it", () => {
  it("the question stays on screen for a page that is gone, and the continuation still runs", async () => {
    const act = vi.fn();
    render(<Page act={act} />);
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "navigate away", hidden: true }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "ask", hidden: true })).toBeNull(),
    ); // self-check: the asker really did unmount
    expect(screen.getByRole("dialog")).toBeTruthy(); // the orphaned question this item closes
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(act).toHaveBeenCalledWith(true));
  });

  it("dismissPending() closes it and the continuation takes its cancel branch — never the confirm one", async () => {
    const act = vi.fn();
    render(<Page act={act} />);
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "navigate away", hidden: true }));

    // Exactly what `router.subscribe(...)` in src/app/router.tsx calls on a location change.
    useConfirmStore.getState().dismissPending();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(act).toHaveBeenCalledWith(false));
    expect(act).not.toHaveBeenCalledWith(true);
  });
});

describe("the three-way is reachable only through its own call — PREDICTION: three labelled outcomes", () => {
  it("askUnsavedChanges resolves save / discard / keep, and Escape means keep", async () => {
    render(<ConfirmHost />);

    const first = confirmDialog.askUnsavedChanges();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await expect(first).resolves.toBe("save");

    const second = confirmDialog.askUnsavedChanges();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await expect(second).resolves.toBe("discard");

    const third = confirmDialog.askUnsavedChanges();
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await expect(third).resolves.toBe("keep");
  });

  it("a two-way ask() renders NO button matching /save/i — R49 held as a rendered property", async () => {
    render(<ConfirmHost />);
    const asked = confirmDialog.ask({ title: "Discard your unsaved changes?", description: "d" });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(asked).resolves.toBe(false);
  });
});
