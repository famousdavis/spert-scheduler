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

// WI-170's tests set what the code fetch answers; every other test gets this default.
const defaultPairing = () => Promise.resolve({ data: { code: "ABCDE-1234" } });
const pairing = vi.hoisted(() => ({ call: null as null | (() => Promise<{ data: { code: string } }>) }));

vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: null,
  db: null,
  isFirebaseAvailable: true,
  getGeneratePairingCode: () => () => (pairing.call ?? defaultPairing)(),
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

function widthClasses(button: HTMLElement): string[] {
  return [...button.classList].filter((c) => /^(min-w-|max-w-|w-)/.test(c));
}

/** As a mouse press would: focus, then click. */
function pressDisconnect() {
  const disconnect = screen.getByRole("button", { name: "Disconnect" });
  disconnect.focus();
  fireEvent.click(disconnect);
}

afterEach(() => {
  cleanup();
  pairing.call = null;
  Reflect.deleteProperty(navigator, "clipboard");
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

/**
 * WI-170: the owner, on Copy Code and Copy Prompt: "I'd prefer that the copy code and copy prompt
 * buttons not move around (including when the MCP server is first fetching the session code, as those
 * buttons start by left-aligning to the placeholder asterisks)." They shared one row with the code, so
 * they sat wherever the code ended, and a word of 6 letters or more wrapped the code and their labels.
 *
 * ⚠️ jsdom has no layout. These tests pin the STRUCTURE that keeps the buttons still; that they do stay
 * still was measured in real Chrome, by getBoundingClientRect in every state, at 1280 px and at 375 px.
 */
describe("WI-170: the Copy buttons stay in one place", () => {
  const LONGEST = "BROCCOLI-4827150936";
  const LONGEST_SHOWN = "BROCCOLI · 4827150936";
  const ERROR = "Couldn\u2019t generate a code.";
  const VALID_LINE = "Valid 15 min · refreshes automatically";

  const copyCode = () => screen.getByRole("button", { name: "Copy Code" });
  const copyPrompt = () => screen.getByRole("button", { name: "Copy Prompt" });

  function panel(open = true) {
    return (
      <ConnectAiPanel
        open={open}
        onClose={() => {}}
        sessionState={sessionState({ aiConnected: false })}
        onChangePermissions={() => Promise.resolve(true)}
        onDisconnect={() => Promise.resolve()}
        feedItems={[]}
      />
    );
  }

  async function renderWithCode() {
    pairing.call = () => Promise.resolve({ data: { code: LONGEST } });
    const view = render(panel());
    await screen.findByText(LONGEST_SHOWN);
    return view;
  }

  function renderLoading() {
    pairing.call = () => new Promise(() => {});
    render(panel());
  }

  async function renderError() {
    pairing.call = () => Promise.reject(new Error("refused"));
    render(panel());
    await screen.findByText(ERROR);
  }

  it("both buttons sit on the Session code line, at its right, Copy Code first, and not on the code's line", async () => {
    await renderWithCode();
    const labelLine = screen.getByText("Session code").parentElement as HTMLElement;
    expect(labelLine).toHaveClass("flex", "justify-between");
    expect(labelLine.firstElementChild).toBe(screen.getByText("Session code"));
    expect(within(labelLine).getAllByRole("button").map((b) => b.textContent)).toEqual(["Copy Code", "Copy Prompt"]);
    expect(labelLine).not.toContainElement(screen.getByText(LONGEST_SHOWN));
  });

  it("the code's line holds the code alone, in the font it had, and cannot wrap, with the Valid line under it", async () => {
    await renderWithCode();
    const code = screen.getByText(LONGEST_SHOWN);
    expect(code).toHaveClass("font-mono", "text-lg", "tracking-wide", "whitespace-nowrap");
    const line = code.parentElement as HTMLElement;
    expect(line.textContent).toBe(LONGEST_SHOWN);
    expect(within(line).queryAllByRole("button")).toEqual([]);
    expect(line.nextElementSibling).toHaveTextContent(VALID_LINE);
  });

  it("the error and Retry take the code's line, at the height a code has", async () => {
    await renderError();
    const line = screen.getByText(ERROR).parentElement as HTMLElement;
    expect(line).toHaveClass("h-7");
    expect(within(line).getByRole("button", { name: "Retry" })).toBeInTheDocument();

    pairing.call = () => Promise.resolve({ data: { code: LONGEST } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findByText(LONGEST_SHOWN)).parentElement).toBe(line);
  });

  it("the placeholder has the code's shape, five dots then ten, with Generating code… under it", () => {
    renderLoading();
    const placeholder = screen.getByText(/^•{5} · •{10}$/);
    expect(placeholder.parentElement?.nextElementSibling).toHaveTextContent("Generating code…");
  });

  it("both are there and greyed while the code loads", () => {
    renderLoading();
    expect(copyCode()).toBeDisabled();
    expect(copyPrompt()).toBeDisabled();
  });

  it("both are there and greyed in the error state", async () => {
    await renderError();
    expect(copyCode()).toBeDisabled();
    expect(copyPrompt()).toBeDisabled();
  });

  it("both are greyed when a later fetch fails, though the last code is still held", async () => {
    const { rerender } = await renderWithCode();
    expect(copyCode()).toBeEnabled();
    pairing.call = () => Promise.reject(new Error("refused"));
    rerender(panel(false));
    rerender(panel());
    await screen.findByText(ERROR);
    expect(copyCode()).toBeDisabled();
    expect(copyPrompt()).toBeDisabled();
  });

  it("both have the same fixed width, Copied! included, and their labels cannot wrap", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
    await renderWithCode();
    const code = copyCode();
    const prompt = copyPrompt();
    const readings = (): string[][] => [widthClasses(code), widthClasses(prompt)];
    expect(readings()).toEqual([["w-24"], ["w-24"]]);

    fireEvent.click(code);
    await waitFor(() => expect(code).toHaveTextContent("Copied!"));
    expect(readings()).toEqual([["w-24"], ["w-24"]]);

    fireEvent.click(prompt);
    await waitFor(() => expect(prompt).toHaveTextContent("Copied!"));
    expect(readings()).toEqual([["w-24"], ["w-24"]]);

    expect(code).toHaveClass("whitespace-nowrap");
    expect(prompt).toHaveClass("whitespace-nowrap");
  });

  it("both labels set their own colour, dark text in the light theme and light text in the dark theme", async () => {
    await renderWithCode();
    expect(copyCode()).toHaveClass("text-gray-900", "dark:text-gray-100");
    expect(copyPrompt()).toHaveClass("text-gray-900", "dark:text-gray-100");
  });
});
