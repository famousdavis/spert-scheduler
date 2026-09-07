// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";

import { ActivityEditModal } from "./ActivityEditModal";
import { ConfirmHost } from "./ConfirmHost";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { useProjectStore } from "@ui/hooks/use-project-store";
import type { Project } from "@domain/models/types";

/**
 * The empty-activity-name behaviour, corrected.
 *
 * ⚠️ A NOTE ON HOW THIS WAS GOT WRONG, because it is the campaign's own defect class.
 * The §3.3 Tier A work extracted `computeGeneralUpdates`, saw that it drops a name which
 * trims to empty, and concluded from that unit alone that "the user clears the field,
 * clicks Save, and the app silently discards the edit". **That was false.** `isValid`
 * already required a non-empty name and the Save button was already `disabled`. A
 * user-facing claim was inferred from a guard without checking the component above it.
 *
 * Measured with a real render, the two actual defects were:
 *   1. Save was correctly disabled, but NOTHING said why — no message, no invalid styling.
 *   2. Worse: `handleDismiss` only prompted when `hasChanges && isValid`. With an empty
 *      name the guard was suppressed by the very state that made saving impossible, so
 *      dismissing threw away EVERY edit — status, estimates, constraint, notes — with no
 *      prompt at all.
 *
 * Both are fixed; these tests pin the fixed behaviour, and they replace the earlier test
 * that pinned the unit in isolation.
 */

const baseProject = (): Project =>
  ({
    id: "p1",
    name: "P1",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    schemaVersion: 23,
    scenarios: [
      {
        id: "s1",
        name: "Baseline",
        startDate: "2026-04-06",
        activities: [
          {
            id: "a1",
            name: "Discovery",
            min: 3,
            mostLikely: 5,
            max: 10,
            confidenceLevel: "mediumConfidence",
            distributionType: "normal",
            status: "planned",
          },
        ],
        dependencies: [],
        milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 10000,
          rngSeed: "s",
          probabilityTarget: 0.5,
          projectProbabilityTarget: 0.95,
        },
      },
    ],
  }) as unknown as Project;

// ⚠️ `ConfirmHost` is rendered ALONGSIDE the editor, not inside it. Since v0.67.12 all three of
// this modal's prompts are asked through `confirmDialog`, which renders in the one host mounted
// in `Layout`. Without it here every ask() would hang unanswered and every row would time out
// rather than fail with a readable message.
const open = (onClose = vi.fn()) => {
  render(
    <>
      <ActivityEditModal
        activityId="a1"
        scenarioId="s1"
        projectId="p1"
        onClose={onClose}
        schedule={undefined}
      />
      <ConfirmHost />
    </>,
  );
  return { onClose };
};

/**
 * A harness that really UNMOUNTS the editor when `onClose` fires, mirroring `ProjectPage`'s
 * `{editingActivityId && <ActivityEditModal …>}`.
 *
 * ⚠️ It exists for exactly one claim and must not be used more widely than that. `open()` above
 * passes a bare spy, so the editor stays mounted whatever happens — which is fine for "was
 * `onClose` called" and for store read-backs, and is why the file's older rows use it. But it
 * makes "Keep editing leaves the draft intact" pass VACUOUSLY: with a spy, the draft survives
 * even when the code discards it. Same trap the dependency-handoff block below warns about.
 */
function LiveEditor({ onClose }: { onClose: () => void }) {
  const [editing, setEditing] = useState(true);
  return (
    <>
      {editing && (
        <ActivityEditModal
          activityId="a1"
          scenarioId="s1"
          projectId="p1"
          onClose={() => {
            setEditing(false);
            onClose();
          }}
          schedule={undefined}
        />
      )}
      <ConfirmHost />
    </>
  );
}

const openLive = (onClose = vi.fn()) => {
  render(<LiveEditor onClose={onClose} />);
  return { onClose };
};

// ⚠️ SCOPED BY ACCESSIBLE NAME, and that is load-bearing rather than tidiness. While a
// confirmation is showing there are TWO role="dialog" nodes on screen — the editor itself is one,
// and it owns a "Save" button of its own. A bare screen.queryByRole("button", { name: /save/i })
// therefore finds the EDITOR's Save and can never go null, so the R49 assertion below would be
// unfalsifiable written that way. Radix wires `aria-labelledby` from `Dialog.Content` to
// `Dialog.Title`, so each dialog is addressable by its own title.
// The three dialog titles this modal can raise. `UNSAVED_TITLE` is `UnsavedChangesDialog`'s own,
// shipped in v0.67.8 and not configurable; the other two are this file's prompts.
const UNSAVED_TITLE = "Unsaved changes";
const DISCARD_CHANGES_TITLE = "Discard your changes?";
const DISCARD_UNSAVED_TITLE = "Discard your unsaved changes?";

const askedDialog = (title: string | RegExp) => screen.findByRole("dialog", { name: title });
const clickIn = (dialog: HTMLElement, name: string) =>
  fireEvent.click(within(dialog).getByRole("button", { name }));

// ⚠️ Looked up by NAME attribute, not by display value. The first draft used
// getByDisplayValue("Discovery"), which stops matching the moment the field is cleared —
// the exact thing every test here does.
const nameInput = () =>
  document.querySelector('input[name="activityName"]') as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const statusSelect = () =>
  document.querySelector('select[name="activityStatus"]') as HTMLSelectElement;

const clearName = (input: HTMLInputElement) =>
  fireEvent.change(input, { target: { value: "   " } });

beforeEach(() => {
  useProjectStore.setState({ projects: [baseProject()] });
  // The confirm store is a module singleton: a question left pending by one row is still
  // showing in the next. Same reset `ConfirmHost.test.tsx` opens with.
  useConfirmStore.setState({ pending: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityEditModal — an emptied activity name", () => {
  it("disables Save", () => {
    open();
    expect(saveButton().disabled).toBe(false);
    clearName(nameInput());
    expect(saveButton().disabled).toBe(true);
  });

  it("EXPLAINS why Save is disabled", () => {
    // The gap that made it feel like a silent discard: the button greyed out and gave no
    // reason. Storing a blank name was never an option — ActivitySchema requires
    // `name: z.string().min(1)` — so telling the user is the whole fix here.
    open();
    expect(screen.queryByText("Activity name is required.")).toBeNull();
    clearName(nameInput());
    expect(screen.getByText("Activity name is required.")).toBeTruthy();
  });

  it("marks the field invalid for assistive technology, not only visually", () => {
    open();
    clearName(nameInput());
    expect(nameInput().getAttribute("aria-invalid")).toBe("true");
    const describedBy = nameInput().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Activity name is required.",
    );
  });

  it("clears the error once a name is typed back", () => {
    open();
    clearName(nameInput());
    fireEvent.change(nameInput(), { target: { value: "Renamed" } });

    expect(screen.queryByText("Activity name is required.")).toBeNull();
    expect(nameInput().getAttribute("aria-invalid")).toBe("false");
    expect(saveButton().disabled).toBe(false);
  });

  describe("dismissing with unsaved changes", () => {
    it("WARNS before discarding, instead of closing silently", async () => {
      // The real defect. Previously `hasChanges && isValid` was false, so this fell
      // straight through to onClose() and every edit vanished without a prompt.
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      fireEvent.keyDown(document, { key: "Escape" });

      const asked = await askedDialog(DISCARD_CHANGES_TITLE);
      expect(within(asked).getByText(/needs a name/i)).toBeTruthy();
      clickIn(asked, "Discard");
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("keeps the modal open when the user declines to discard", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      fireEvent.keyDown(document, { key: "Escape" });

      clickIn(await askedDialog(DISCARD_CHANGES_TITLE), "Keep editing");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: DISCARD_CHANGES_TITLE })).toBeNull());
      expect(onClose).not.toHaveBeenCalled();
    });

    it("closes without any prompt when nothing was changed", async () => {
      // An empty name alone is not a change — computeGeneralUpdates drops it — so there
      // is nothing to warn about.
      const { onClose } = open();

      clearName(nameInput());
      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("dialog", { name: DISCARD_CHANGES_TITLE })).toBeNull();
      expect(screen.queryByRole("dialog", { name: UNSAVED_TITLE })).toBeNull();
    });

    it("still offers to SAVE when the form is valid", async () => {
      // The pre-existing path must be untouched by the new branch.
      open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      fireEvent.keyDown(document, { key: "Escape" });

      const asked = await askedDialog(UNSAVED_TITLE);
      expect(within(asked).getByRole("button", { name: "Save" })).toBeTruthy();
    });
  });
});

/**
 * Handing off to the dependency dialog must NOT close this modal.
 *
 * The same defect class as the block above, found the same way — by a person using the
 * app, not by any metric. `handleDismiss` is the unsaved-changes guard, and it hangs off
 * `Dialog.Root onOpenChange`, so Escape and overlay clicks route through it. Both
 * dependency handoffs called the parent's `onClose()` DIRECTLY, which walks around the
 * guard entirely: ActivityEditModal unmounted and every draft in it — name, estimates,
 * constraint, description, checklist, deliverables, notes — was discarded with no prompt.
 * Reproduced against v0.64.0 in a browser before the fix.
 *
 * The dependency dialog now stacks on top instead. `onClose` NOT being called IS the
 * mechanism, so that is what these assert.
 *
 * ⚠️ Do not "strengthen" these by asserting the draft field still holds its value after
 * the click. RTL renders this component directly and `onClose` is a spy, so nothing
 * unmounts in the test either way — that assertion passes vacuously against the very
 * code it is supposed to catch. Ask the harness only what it can actually answer.
 */
describe("ActivityEditModal — handing off to the dependency dialog", () => {
  const projectWithDependency = (): Project => {
    const p = baseProject();
    const sc = p.scenarios[0]!;
    sc.activities.push({
      id: "a2",
      name: "Build",
      min: 4,
      mostLikely: 6,
      max: 12,
      confidenceLevel: "mediumConfidence",
      distributionType: "normal",
      status: "planned",
    } as unknown as (typeof sc.activities)[number]);
    sc.dependencies.push({
      fromActivityId: "a1",
      toActivityId: "a2",
      type: "FS",
      lagDays: 0,
    } as unknown as (typeof sc.dependencies)[number]);
    return p;
  };

  const openWithDeps = () => {
    const onClose = vi.fn();
    const onAddDependency = vi.fn();
    const onEditDependency = vi.fn();
    useProjectStore.setState({ projects: [projectWithDependency()] });
    render(
      <>
        <ActivityEditModal
          activityId="a1"
          scenarioId="s1"
          projectId="p1"
          onClose={onClose}
          schedule={undefined}
          dependencyMode
          onAddDependency={onAddDependency}
          onEditDependency={onEditDependency}
        />
        <ConfirmHost />
      </>,
    );
    // The section is collapsed on mount (defaultOpen={false}); its controls do not exist
    // until it is opened, so this click is a precondition, not part of the behaviour.
    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }));
    return { onClose, onAddDependency, onEditDependency };
  };

  it("renders the handoff controls once the section is expanded", () => {
    // Guards the two tests below from passing because the buttons were never there.
    openWithDeps();
    expect(screen.getByRole("button", { name: "+ Add Dependency" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  // ⚠️ The "no prompt" half of these two USED to be `expect(confirmSpy).not.toHaveBeenCalled()`.
  // That assertion died in v0.67.12: nothing in this file calls the native prompt any more, so it
  // would have passed for the rest of time whatever the handoffs did.
  //
  // ⚠️ ITS FIRST REPLACEMENT WAS ALSO DEAD, and the reason is worth keeping because it is not
  // obvious. Counting `getAllByRole("dialog")` and expecting ONE looks like it would catch a
  // second dialog appearing — it does not. Radix sets `aria-hidden="true"` on the dialog
  // underneath whenever another opens, so the count in the ACCESSIBILITY TREE is one whether or
  // not a confirmation is showing; only the DOM count moves. MEASURED: dialogsInDom 2,
  // dialogsInA11y 1. Asking for the editor BY NAME is the assertion that actually discriminates —
  // it is the one that goes missing when something else covers it.
  it("keeps the modal open when adding a dependency, with no prompt", async () => {
    const { onClose, onAddDependency } = openWithDeps();

    // An unsaved draft is what made the old behaviour destructive.
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Dependency" }));

    expect(onAddDependency).toHaveBeenCalledWith("a1");
    expect(screen.getByRole("dialog", { name: "Edit Activity" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the modal open when editing a dependency, with no prompt", async () => {
    const { onClose, onEditDependency } = openWithDeps();

    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(onEditDependency).toHaveBeenCalledWith("a1", "a2");
    expect(screen.getByRole("dialog", { name: "Edit Activity" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * Cancel asks "discard?". Escape asks "save?". The asymmetry IS the requirement.
 *
 * Owner ruling, v0.67.5: "It would be better to prompt the user and ask them if they want to
 * discard their unsaved changes. That is a safer choice. They might think they hit Save and
 * their changes were saved when in fact they were discarded."
 *
 * ⚠️ THE PROMPT MUST NEVER OFFER TO SAVE, and that is the whole point of these rows. v0.67.3
 * routed Cancel through handleDismiss, whose question is "Save them?": OK saved, and the only
 * other answer kept editing, so no discard path existed anywhere in the modal. handleCancel
 * cannot save — it does not reference handleSave — and the rows below pin both halves: the exact
 * discard wording, AND that the store is untouched after the prompt is accepted.
 *
 * ⚠️ This button has now been changed three times (silent onClose through v0.67.2 → handleDismiss
 * in v0.67.3 → onClose again → handleCancel). Two of those were "obviously right" when proposed.
 * If these rows look wrong to a later reader, re-read the call-site comment before editing them.
 *
 * One wording covers the valid and the invalid draft alike. handleDismiss says "can't be saved"
 * for an empty name, which is useful when the question is whether to save; on Cancel it would be
 * misleading, because Cancel never saves and the discard is not a consequence of the missing name.
 *
 * ⚠️ Draft survival on a declined prompt is not asserted here. RTL renders this component directly
 * and `onClose` is a spy, so nothing unmounts either way and the assertion would pass vacuously
 * against the very code it targets. It was watched in a browser instead.
 */
describe("ActivityEditModal — dismissing the modal", () => {
  const storedStatus = () =>
    useProjectStore.getState().projects[0]!.scenarios[0]!.activities[0]!.status;
  const storedName = () =>
    useProjectStore.getState().projects[0]!.scenarios[0]!.activities[0]!.name;

  const clickCancel = () =>
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const pressEscape = () => fireEvent.keyDown(document, { key: "Escape" });

  const setConstraintTypeOnly = () => {
    // Reaches `hasChanges && !isValid` WITHOUT touching the name: picking a type defaults the
    // mode to "hard" but leaves the date null, and `isValid` requires all three.
    fireEvent.click(screen.getByRole("button", { name: "Scheduling Constraint" }));
    fireEvent.change(document.querySelector('select[name="constraintType"]')!, {
      target: { value: "SNET" },
    });
  };

  // ⚠️ Positive control for the store read-back, FIRST on purpose. Every "the store is unchanged"
  // assertion below is a leave-alone, and a leave-alone proves nothing unless the same instrument
  // has been shown to register a change. If this fails, `storedStatus()` is reading something the
  // modal never writes to and the unchanged-assertions are all passing for the wrong reason.
  //
  // ⚠️ REBUILT in v0.67.12, not carried over. It has always driven its save THROUGH ESCAPE, and
  // Escape is precisely the route this release changed: the save now sits behind the three-way's
  // Save button instead of behind the native prompt's OK. Re-falsified after the rewrite by
  // pressing "Discard" here instead — the row goes red, so it still discriminates a save from a
  // non-save rather than merely observing that Escape does something.
  it("PRECONDITION: the store read-back can observe a save landing", async () => {
    open();

    expect(storedStatus()).toBe("planned");
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    pressEscape();
    clickIn(await askedDialog(UNSAVED_TITLE), "Save");

    await waitFor(() => expect(storedStatus()).toBe("inProgress"));
  });

  describe("the Cancel button asks before discarding, and never saves", () => {
    it("discards a valid draft and closes when the prompt is accepted", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clickCancel();
      clickIn(await askedDialog(DISCARD_UNSAVED_TITLE), "Discard");

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      // ⚠️ The assertion that pins "Cancel never saves", independent of the wording above.
      expect(storedStatus()).toBe("planned");
    });

    it("returns to the modal, and writes nothing, when the prompt is declined", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clickCancel();
      clickIn(await askedDialog(DISCARD_UNSAVED_TITLE), "Keep editing");

      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: DISCARD_UNSAVED_TITLE })).toBeNull(),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(storedStatus()).toBe("planned");
    });

    it("uses the same discard wording for a draft that cannot be saved", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      clickCancel();

      // Not handleDismiss's "needs a name…" — Cancel never saves, so explaining why saving is
      // impossible would answer a question the user did not ask.
      const asked = await askedDialog(DISCARD_UNSAVED_TITLE);
      expect(within(asked).queryByText(/needs a name/i)).toBeNull();
      clickIn(asked, "Discard");

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(storedStatus()).toBe("planned");
      expect(storedName()).toBe("Discovery");
    });

    it("stays put when the discard prompt is declined on an unsaveable draft", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      clickCancel();
      clickIn(await askedDialog(DISCARD_UNSAVED_TITLE), "Keep editing");

      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: DISCARD_UNSAVED_TITLE })).toBeNull(),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(storedStatus()).toBe("planned");
    });

    it("offers NO button matching /save/i — R49 held as a rendered property", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clickCancel();
      const asked = await askedDialog(DISCARD_UNSAVED_TITLE);

      // ⚠️ SCOPED TO `asked`, NOT TO `screen`. The editor is itself a role="dialog" and owns a
      // Save button of its own, which is why the unscoped form is the wrong instrument here.
      //
      // ⚠️ THOUGH NOT FOR THE REASON IT LOOKS LIKE, and the difference was measured rather than
      // reasoned. The unscoped `screen.queryByRole("button", { name: /save/i })` DOES return null
      // once the confirmation is up — Radix aria-hidden="true"s the editor beneath it, so the
      // editor's Save leaves the accessibility tree (in DOM 1, in a11y tree 0). So the unscoped
      // version would pass, and would look like it asserted this. What it would really assert is
      // that Radix still hides the layer underneath — a property of the dialog library, not of
      // this app — and it would go green again for that reason even if `handleCancel` grew a Save
      // button placed outside the confirmation. Scoping asks the question this row is named for.
      expect(within(asked).queryByRole("button", { name: /save/i })).toBeNull();
      expect(
        within(asked)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Keep editing", "Discard"]);

      // …and neither outcome it DOES offer can write. This one is the destructive one.
      clickIn(asked, "Discard");
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(storedStatus()).toBe("planned");
      expect(storedName()).toBe("Discovery");
    });
  });

  // ⚠️ These four rows were the CONTROL for v0.67.5's revert and were carried over unedited from
  // it, on the reasoning that the revert was scoped to the Cancel button. That reasoning expired
  // in v0.67.12: this release changes Escape itself, so all four had to be rewritten. They are
  // kept, not deleted — what they control for now is that Escape's SAVE and KEEP outcomes still
  // behave as they did when the browser owned the box, with DISCARD added beside them.
  describe("Escape offers all three outcomes", () => {
    it("Save saves and closes", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      pressEscape();
      clickIn(await askedDialog(UNSAVED_TITLE), "Save");

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(storedStatus()).toBe("inProgress");
    });

    it("Keep editing returns to the modal and writes nothing", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      pressEscape();
      clickIn(await askedDialog(UNSAVED_TITLE), "Keep editing");

      await waitFor(() => expect(screen.queryByRole("dialog", { name: UNSAVED_TITLE })).toBeNull());
      expect(onClose).not.toHaveBeenCalled();
      expect(storedStatus()).toBe("planned");
    });

    // ⚠️ THE ITEM'S HEADLINE. Before v0.67.12 Escape offered save-or-keep and nothing else, so a
    // user who wanted to abandon a VALID draft had to reach for the Cancel button. The known gap
    // recorded on the buttons in v0.67.5 is this row.
    it("Discard closes with the store unchanged — the outcome Escape did not have", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      pressEscape();
      clickIn(await askedDialog(UNSAVED_TITLE), "Discard");

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(storedStatus()).toBe("planned");
      expect(storedName()).toBe("Discovery");
    });

    // ⚠️ Uses the LIVE harness on purpose. With a bare `onClose` spy the editor never unmounts, so
    // "the draft is intact" would hold even if the code had discarded it — the vacuous version of
    // this row. Here the editor really goes away on close, so its still being on screen with
    // "inProgress" still selected is evidence.
    it("Keep editing leaves the editor open with the draft intact", async () => {
      const { onClose } = openLive();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      pressEscape();
      clickIn(await askedDialog(UNSAVED_TITLE), "Keep editing");

      await waitFor(() => expect(screen.queryByRole("dialog", { name: UNSAVED_TITLE })).toBeNull());
      expect(screen.getByRole("dialog", { name: "Edit Activity" })).toBeTruthy();
      expect(statusSelect().value).toBe("inProgress");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("a discarded draft really does leave the editor", async () => {
      // The must-change partner to the row above, on the same harness: if `openLive` could not
      // observe an unmount, "still on screen" would prove nothing.
      openLive();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      pressEscape();
      clickIn(await askedDialog(UNSAVED_TITLE), "Discard");

      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Edit Activity" })).toBeNull(),
      );
    });
  });

  describe("Escape on a draft that cannot be saved asks to discard, and says why", () => {
    it("warns before discarding a draft whose name is missing", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      pressEscape();

      const asked = await askedDialog(DISCARD_CHANGES_TITLE);
      expect(within(asked).getByText(/needs a name, so your changes can't be saved/i)).toBeTruthy();
      // No Save button: with no name there is nothing the app could save, so offering it would
      // promise something impossible. This is site 8's own reason, NOT R49's.
      expect(within(asked).queryByRole("button", { name: /save/i })).toBeNull();
      clickIn(asked, "Discard");

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(storedStatus()).toBe("planned");
      expect(storedName()).toBe("Discovery");
    });

    it("stays put when the discard warning is declined", async () => {
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      pressEscape();
      clickIn(await askedDialog(DISCARD_CHANGES_TITLE), "Keep editing");

      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: DISCARD_CHANGES_TITLE })).toBeNull(),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(storedStatus()).toBe("planned");
    });

    // ⚠️ THE ROW THAT MAKES THE OTHER TWO NON-VACUOUS, and the defect it pins is a copy defect
    // that predates this release. `isValid` has TWO causes, not one — an empty name, or a
    // constraint missing its date or mode — and until v0.67.12 both produced the single sentence
    // "This activity needs a name, so your changes can't be saved." With a perfectly good name
    // that sentence was simply false, and the constraint case renders no inline explanation
    // anywhere in the editor, so the prompt was the only place the user could have been told.
    it("names the CONSTRAINT, not the name, when the constraint is what blocks saving", async () => {
      const { onClose } = open();

      setConstraintTypeOnly();
      pressEscape();

      const asked = await askedDialog(DISCARD_CHANGES_TITLE);
      expect(within(asked).queryByText(/needs a name/i)).toBeNull();
      expect(within(asked).getByText(/constraint needs both a date and a mode/i)).toBeTruthy();
      clickIn(asked, "Discard");

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(storedName()).toBe("Discovery");
    });
  });

  /**
   * Focus, pinned per OUTCOME rather than per site — the three sites are the only ones in the
   * migration whose opener's fate depends on the answer.
   *
   * ⚠️ These pin the SURVIVING outcomes only, and that split is deliberate. The confirming
   * outcomes (Save, Discard, an accepted discard) unmount the editor, so `openerRef` holds a
   * detached node, `focus()` no-ops and focus falls to `<body>`. That is what `ActivityEditModal`
   * has always done on every close path — it is a controlled `Dialog.Root` with no
   * `Dialog.Trigger` — so pinning it here would pin an inherited gap as though it were this
   * component's contract. WI-17 owns it. Measured in Chromium for all seven outcomes; see the
   * table in `ConfirmDialog`'s doc comment.
   *
   * ⚠️ What made these worth writing: `ConfirmHost.test.tsx` pins the three-way's OUTCOMES but has
   * no focus assertion of any kind, and `UnsavedChangesDialog` has no test file at all. So the
   * opener capture, the Keep-button default focus and the restore were entirely unpinned before
   * this release, in the component this modal now depends on.
   */
  describe("a surviving outcome puts the keyboard back where it was", () => {
    const focusCancel = () => {
      const cancel = screen.getByRole("button", { name: "Cancel" });
      cancel.focus();
      expect(document.activeElement).toBe(cancel); // self-check: focus was delivered
      return cancel;
    };

    it("site 7 — Keep editing returns focus to the opener", async () => {
      openLive();
      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      const opener = focusCancel();

      pressEscape();
      const asked = await askedDialog(UNSAVED_TITLE);
      expect(document.activeElement).toBe(within(asked).getByRole("button", { name: "Keep editing" }));
      clickIn(asked, "Keep editing");

      await waitFor(() => expect(document.activeElement).toBe(opener));
      expect(opener.isConnected).toBe(true);
    });

    it("site 8 — declining an unsaveable discard returns focus to the opener", async () => {
      openLive();
      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      const opener = focusCancel();

      pressEscape();
      clickIn(await askedDialog(DISCARD_CHANGES_TITLE), "Keep editing");

      await waitFor(() => expect(document.activeElement).toBe(opener));
      expect(opener.isConnected).toBe(true);
    });

    it("site 9 — declining Cancel's discard returns focus to the Cancel button itself", async () => {
      openLive();
      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      const opener = focusCancel();

      fireEvent.click(opener);
      clickIn(await askedDialog(DISCARD_UNSAVED_TITLE), "Keep editing");

      await waitFor(() => expect(document.activeElement).toBe(opener));
      expect(opener.isConnected).toBe(true);
    });
  });

  // ⚠️ The only genuinely shared case — and it CANNOT discriminate the two gestures, by
  // construction: with no changes handleDismiss reduces to a bare onClose(), so routing through it
  // and calling it directly are identical. Here because it is the common path and must not
  // regress, NOT as evidence that Cancel discards. It is also the one pair in this file that
  // passes both before and after v0.67.12, which is why it is stated rather than counted.
  describe("with nothing changed, both just close", () => {
    for (const [label, dismiss] of [
      ["the Cancel button", clickCancel],
      ["Escape", pressEscape],
    ] as const) {
      it(`${label} closes with no prompt at all`, async () => {
        const { onClose } = open();

        dismiss();

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        // The editor is still the dialog on offer — nothing was raised over it. See the note in
        // the dependency-handoff block above for why this is asked by NAME and not by counting.
        expect(screen.getByRole("dialog", { name: "Edit Activity" })).toBeTruthy();
      });
    }
  });
});
