// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, within, cleanup } from "@testing-library/react";
import type { AiSessionState } from "@ui/hooks/use-ai-connectivity";
import type { AiFeedItem } from "./AiActivityFeed";

/**
 * WI-111: the Connect AI panel had no close button — only Esc or a click outside closed it — and its
 * Disconnect ended the AI session at once, with no question. The panel now has the Share window's
 * close button in its title row, and Disconnect asks first.
 *
 * What Disconnect does was MEASURED before the words were written (the page's handler and the AI
 * hook, with Firestore replaced): this tab stops listening to the session, the session's project
 * snapshot is deleted and the server is asked to end the session (whose failure is only logged), the
 * stored session id and consent are forgotten — so the next Connect AI starts a new session — and the
 * page clears the "Recent AI activity" list.
 *
 * ⚠️ While the question is open, Radix hides the panel beneath it from the accessibility tree, so the
 * panel is found by its title text there, never by role.
 * ⚠️ `fireEvent.click` does not move focus; a real click on a button does (Chromium). So Disconnect
 * is focused before it is clicked, as a mouse press would, and the focus readings below are about
 * where the question puts focus back.
 */

vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: null,
  db: null,
  isFirebaseAvailable: true,
  getGeneratePairingCode: () => () => Promise.resolve({ data: { code: "ABCDE-1234" } }),
  getTeardownAiSession: () => null,
  getSendInvitationEmail: () => null,
  getClaimPendingInvitations: () => null,
  getRevokeInvite: () => null,
  getResendInvite: () => null,
}));

import { ConnectAiPanel } from "./ConnectAiPanel";

const PANEL_TITLE = "AI session active";
const QUESTION = "End this AI session?";
const CONSEQUENCES =
  "The AI will no longer be able to change this project, and the Recent AI activity list will be cleared. To use an AI again, press Connect AI to start a new session.";
const CODE = "ABCDE · 1234";

function sessionState(overrides: Partial<AiSessionState> = {}): AiSessionState {
  return { sessionActive: true, aiConnected: true, consentRead: true, sessionId: "sess-panel", ...overrides };
}

async function renderPanel(state: AiSessionState = sessionState()) {
  const onClose = vi.fn<() => void>();
  const onDisconnect = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const onChangePermissions = vi.fn<(consentRead: boolean) => Promise<boolean>>(() => Promise.resolve(true));
  const feedItems: AiFeedItem[] = [];
  render(
    <ConnectAiPanel
      open
      onClose={onClose}
      sessionState={state}
      onChangePermissions={onChangePermissions}
      onDisconnect={onDisconnect}
      feedItems={feedItems}
    />,
  );
  // The panel fetches its code as it opens; wait for it, so nothing lands after a test's last step.
  await screen.findByText(CODE);
  return { onClose, onDisconnect };
}

/** As a mouse press would: focus, then click. */
function pressDisconnect() {
  const disconnect = screen.getByRole("button", { name: "Disconnect" });
  disconnect.focus();
  fireEvent.click(disconnect);
}

afterEach(() => {
  cleanup();
});

describe("WI-111: the Connect AI panel's close button", () => {
  it("the title row's Close button closes the panel, and the AI session stays", async () => {
    const { onClose, onDisconnect } = await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("control: Esc closes the panel, and the AI session stays", async () => {
    const { onClose, onDisconnect } = await renderPanel();
    fireEvent.keyDown(screen.getByRole("dialog", { name: PANEL_TITLE }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("control: a press outside the panel closes it, and the AI session stays", async () => {
    const { onClose, onDisconnect } = await renderPanel();
    // Radix starts listening for a press outside one tick after the panel opens.
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("control: the panel shows the session code", async () => {
    await renderPanel(sessionState({ aiConnected: false }));
    expect(screen.getByText(CODE)).toBeInTheDocument();
    expect(screen.getByText("Waiting for AI…")).toBeInTheDocument();
  });
});

describe("WI-111: Disconnect asks before it ends the AI session", () => {
  it("Disconnect asks first: nothing is ended until the question is answered", async () => {
    const { onClose, onDisconnect } = await renderPanel();
    pressDisconnect();
    const question = screen.getByRole("dialog", { name: QUESTION });
    expect(question).toHaveAccessibleDescription(CONSEQUENCES);
    expect(within(question).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(question).getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(PANEL_TITLE)).toBeInTheDocument();
  });

  it("Cancel keeps the panel open and the session connected, and puts focus back on Disconnect", async () => {
    const { onClose, onDisconnect } = await renderPanel();
    pressDisconnect();
    const question = screen.getByRole("dialog", { name: QUESTION });
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: QUESTION })).toBeNull());

    expect(screen.getByRole("dialog", { name: PANEL_TITLE })).toBeInTheDocument();
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Disconnect" }));
  });

  it("Esc on the question closes only the question, and puts focus back on Disconnect", async () => {
    const { onClose, onDisconnect } = await renderPanel();
    pressDisconnect();
    fireEvent.keyDown(screen.getByRole("dialog", { name: QUESTION }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: QUESTION })).toBeNull());

    expect(screen.getByRole("dialog", { name: PANEL_TITLE })).toBeInTheDocument();
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Disconnect" }));
  });

  it("confirming ends the session once, then closes the panel", async () => {
    const { onClose, onDisconnect } = await renderPanel();
    pressDisconnect();
    const question = screen.getByRole("dialog", { name: QUESTION });
    await act(async () => {
      fireEvent.click(within(question).getByRole("button", { name: "Disconnect" }));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});
