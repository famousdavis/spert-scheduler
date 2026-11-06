// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { ConnectAiConsentModal } from "./ConnectAiConsentModal";
import { CONSENT_WORDS } from "./consent-words";
import { AI_CONSENT_VERSION } from "@app/ai-connectivity-constants";

/**
 * WI-150 release C (owner, R650 ruling 9) — the consent window asks again, in new words that name
 * progress: neither box is ticked for the user, Read Mode's line says it is required for recording
 * progress, and the words live in ONE place (`CONSENT_WORDS`).
 */
afterEach(() => cleanup());

function Harness({ onConnect }: { onConnect: (read: boolean) => Promise<boolean> }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>reopen</button>
      <ConnectAiConsentModal open={open} onClose={() => setOpen(false)} onConnect={onConnect} projectName="Cloud ERP" />
    </>
  );
}

const box = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const connect = () => screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement;

describe("the consent window (consent version 2)", () => {
  it("is version 2: a consent stored under version 1's words is asked again", () => {
    expect(AI_CONSENT_VERSION).toBe(2);
  });

  it("ticks neither box for the user, and Connect waits for Write Mode", () => {
    render(<Harness onConnect={vi.fn(async () => true)} />);
    expect(box("aiConsentWrite").checked).toBe(false);
    expect(box("aiConsentRead").checked).toBe(false);
    expect(box("aiConsentWrite").disabled).toBe(false);
    expect(connect().disabled).toBe(true);
    fireEvent.click(box("aiConsentWrite"));
    expect(connect().disabled).toBe(false);
  });

  it("connects with the user's Read choice, Write ticked", async () => {
    const onConnect = vi.fn(async () => true);
    render(<Harness onConnect={onConnect} />);
    fireEvent.click(box("aiConsentWrite"));
    fireEvent.click(box("aiConsentRead"));
    await act(async () => { fireEvent.click(connect()); });
    expect(onConnect).toHaveBeenCalledWith(true);
  });

  it("opened again after Cancel, both boxes are unticked again", () => {
    render(<Harness onConnect={vi.fn(async () => true)} />);
    fireEvent.click(box("aiConsentWrite"));
    fireEvent.click(box("aiConsentRead"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.querySelector('input[name="aiConsentWrite"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));
    expect(box("aiConsentWrite").checked).toBe(false);
    expect(box("aiConsentRead").checked).toBe(false);
  });

  it("shows the owner's exact words: Write names progress; Read is required for updating it", () => {
    render(<Harness onConnect={vi.fn(async () => true)} />);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { name: CONSENT_WORDS.title })).toBeInTheDocument();
    expect(dialog.textContent).toContain(`${CONSENT_WORDS.introBeforeName} Cloud ERP${CONSENT_WORDS.introAfterName}`);
    expect(dialog.textContent).toContain(CONSENT_WORDS.write.detail);
    expect(dialog.textContent).toContain(CONSENT_WORDS.read.detail);
    // Whole, as literals: he approved these exact words, so one word moving is a change he has not seen.
    expect(CONSENT_WORDS.write.detail).toBe(
      "Let the AI create and edit this project's activities, estimates, milestones, section headers and notes, and, with Read Mode, update each activity's progress: its Status, Actual Start and Actual Finish.",
    );
    expect(CONSENT_WORDS.read.detail).toBe(
      "Let the AI read this project's full schedule — every scenario (including locked ones), their activities, estimates, milestones, section headers, dependencies, and computed, recorded and planned dates, plus activity notes, descriptions, and checklist/deliverable items — so it can make context-aware edits. Required for dependency edits, reordering activities and updating progress.",
    );
  });
});
