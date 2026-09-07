// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `ConfirmDialog` behaviour pins (WI-6a, v0.67.8).
 *
 * Every `it` states its PREDICTION in its own name, and self-checks that the gesture was
 * actually delivered before asserting the behaviour — a focus that never moved, or a dialog
 * that never opened, would otherwise read exactly like a pass.
 *
 * WARNING: falsify these against the FINISHED component, never against the pre-WI-6a one.
 * The old component has no `open`/`onCancel`/`cancelLabel` props at all, so every probe here
 * "fails" it by `tsc` — which proves nothing about behaviour. The failure counts recorded in
 * the PR come from deleting one behaviour at a time from the shipped file:
 * remove `onOpenAutoFocus` → P2 fails; remove `onCloseAutoFocus` → P6' and P9a' fail;
 * remove the `confirmedRef` gate → P3's cancel and escape cases fail.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ConfirmDialog } from "./ConfirmDialog";

function DetachingTrigger() {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  return (
    <div>
      <button type="button">bystander</button>
      {!gone && (
        <button type="button" onClick={() => setOpen(true)}>
          Delete row
        </button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete?"
        description="d"
        confirmLabel="Yes, delete"
        onConfirm={() => setGone(true)}
      />
    </div>
  );
}

describe("P1 focus after the confirmed action destroys the opener — PREDICTION: document.body", () => {
  it("lands on body, not on the bystander — the second cause this component does NOT close", async () => {
    render(<DetachingTrigger />);
    const trigger = screen.getByRole("button", { name: "Delete row" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger); // self-check: focus was delivered
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog"); // self-check: dialog opened
    expect(dialog).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Delete row" })).toBeNull(); // opener gone
    expect(document.activeElement).toBe(document.body);
  });
});

describe("P2 default focus on open — PREDICTION: the Cancel button", () => {
  // WARNING: this outcome is OVER-DETERMINED and P2 alone does not falsify the mechanism.
  // Cancel is already the first tabbable in the content, so Radix's default autofocus lands
  // there even with `onOpenAutoFocus` deleted — measured: removing that handler fails P6',
  // P9a' and P9c (the opener capture) but leaves P2 GREEN. P2 pins what the user experiences;
  // the explicit `cancelRef.focus()` is what keeps it true if the buttons are ever reordered.
  // If you reorder them, this test will keep passing while the behaviour changes — reach for
  // the mechanism, not this assertion.
  it("focuses Cancel via onOpenAutoFocus, no effect involved", async () => {
    render(
      <ConfirmDialog open title="t" description="d" onConfirm={() => {}} cancelLabel="Keep current" />,
    );
    const cancel = await screen.findByRole("button", { name: "Keep current" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });
});

describe("P3 onCancel / onConfirm fire exactly once — PREDICTION: confirm→(1,0) cancel→(0,1) escape→(0,1)", () => {
  function mount() {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="t"
        description="d"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmLabel="Go"
      />,
    );
    return { onConfirm, onCancel, onOpenChange };
  }

  it("confirm click", () => {
    const s = mount();
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(s.onConfirm).toHaveBeenCalledTimes(1);
    expect(s.onCancel).toHaveBeenCalledTimes(0);
    expect(s.onOpenChange).toHaveBeenCalledWith(false); // Dialog.Close still reports the close
  });

  it("cancel click", () => {
    const s = mount();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(s.onConfirm).toHaveBeenCalledTimes(0);
    expect(s.onCancel).toHaveBeenCalledTimes(1);
  });

  it("escape key", () => {
    const s = mount();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(s.onOpenChange).toHaveBeenCalledWith(false); // self-check: Escape was delivered
    expect(s.onConfirm).toHaveBeenCalledTimes(0);
    expect(s.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("P4 Escape reaches only the highest Radix layer — PREDICTION: inner closes, outer untouched, in BOTH topologies", () => {
  it("nested topology (confirm rendered inside the outer Dialog.Content)", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <Dialog.Root open onOpenChange={outer}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>Outer</Dialog.Title>
            <ConfirmDialog open onOpenChange={inner} title="Inner" description="d" onConfirm={() => {}} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    // self-check: both mounted. The outer is aria-hidden while the inner is open, so the
    // un-hidden query would see only 1 — `hidden: true` is what makes this check honest.
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(inner).toHaveBeenCalledWith(false);
    expect(outer).not.toHaveBeenCalled();
  });

  it("sibling topology (confirm mounted elsewhere in the tree, as the Layout host is)", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Dialog.Root open onOpenChange={outer}>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content aria-describedby={undefined}>
              <Dialog.Title>Outer</Dialog.Title>
              <button type="button">inside outer</button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <ConfirmDialog open onOpenChange={inner} title="Inner" description="d" onConfirm={() => {}} />
      </>,
    );
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2); // self-check
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(inner).toHaveBeenCalledWith(false);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe("P5 trigger mode still works now that controlled mode exists — PREDICTION: opens on click, confirms", () => {
  it("the ProjectTile / SharingSection contract is unchanged", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button type="button">Open it</button>}
        title="t"
        description="d"
        onConfirm={onConfirm}
        confirmLabel="Do"
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Do" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

function StagedSibling() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Dialog.Root open onOpenChange={() => {}}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>Outer</Dialog.Title>
            <button type="button" onClick={() => setOpen(true)}>
              open inner
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Inner" description="d" onConfirm={() => {}} />
    </>
  );
}

describe("P6' focus after a sibling-mounted confirm closes, opened from inside another dialog — PREDICTION: returns to the 'open inner' button", () => {
  it("the FocusScope stack resumes the outer scope at the element that opened the inner", async () => {
    render(<StagedSibling />);
    const opener = screen.getByRole("button", { name: "open inner" });
    await waitFor(() => expect(document.activeElement).toBe(opener)); // self-check: outer autofocused
    fireEvent.click(opener);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel)); // self-check: inner owns focus
    fireEvent.keyDown(cancel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

function SurvivingOpener({ raw }: { raw: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {raw ? (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content
              aria-describedby={undefined}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                (document.querySelector("button") as HTMLButtonElement).focus();
              }}
            >
              <Dialog.Title>raw</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <ConfirmDialog open={open} onOpenChange={setOpen} title="t" description="d" onConfirm={() => {}} />
      )}
    </div>
  );
}

describe("P9 where a CONTROLLED, trigger-less Radix dialog returns focus — baseline PREDICTION was NOWHERE (body), even with the opener alive", () => {
  it("P9a' ConfirmDialog controlled, WITH the opener capture/restore — PREDICTION FLIPS: focus returns to the surviving opener", async () => {
    render(<SurvivingOpener raw={false} />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    expect(document.activeElement).toBe(opener); // self-check
    fireEvent.click(opener);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel)); // self-check
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("P9b a raw controlled Dialog with its own onCloseAutoFocus override also returns focus — the mechanism, not our component, is what does it", async () => {
    render(<SurvivingOpener raw />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    fireEvent.click(opener);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("P9c TRIGGER mode (ProjectTile / SharingSection) still returns focus to the trigger — not regressed by the restore", async () => {
    render(
      <ConfirmDialog trigger={<button type="button">trigger</button>} title="t" description="d" onConfirm={() => {}} />,
    );
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

function SiteManagedFocus() {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  return (
    <div>
      <button type="button">bystander</button>
      {!gone && (
        <button type="button" onClick={() => setOpen(true)}>
          Delete row
        </button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete?"
        description="d"
        confirmLabel="Yes, delete"
        onConfirm={() => {
          setGone(true);
          queueMicrotask(() =>
            (screen.getByRole("button", { name: "bystander" }) as HTMLButtonElement).focus(),
          );
        }}
      />
    </div>
  );
}

describe("P7 a call site that names its own focus destination in a microtask — PREDICTION: it SURVIVES", () => {
  it("the bystander ends focused, so WI-6b/c/d can supply the five named destinations", async () => {
    render(<SiteManagedFocus />);
    const trigger = screen.getByRole("button", { name: "Delete row" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((r) => setTimeout(r, 5));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "bystander" }));
  });
});
