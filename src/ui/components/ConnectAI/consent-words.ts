// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Connect AI consent window's words, in ONE place (WI-150 release C, owner, R650 ruling 9), so a
 * change to them is one edit here and one re-shot picture. The owner approves these exact words.
 * They are PERMISSION, on purpose: they name section headers, which no AI tool reads or writes at
 * v0.84.0, and "update", where v0.84.0's tool only adds.
 *
 * ⚠️ A change to what Write Mode or Read Mode lets the AI do is a change to what the user agreed to:
 * raise `AI_CONSENT_VERSION` (`app/ai-connectivity-constants.ts`) in the same change, so a consent
 * stored under the old words is asked again. Version 2 (v0.84.0) added recording progress.
 */
export const CONSENT_WORDS = {
  title: "Connect an AI assistant",
  /** The project's name sits between these two, in bold. */
  introBeforeName: "Connecting lets your AI chatbot build and edit",
  introAfterName:
    ". You stay in control: the AI asks what to build before doing anything, and you choose what it can access.",
  write: {
    label: "Write Mode",
    note: "(required)",
    detail:
      "Let the AI create and edit this project's activities, estimates, milestones, section headers and notes, and, with Read Mode, update each activity's progress: its Status, Actual Start and Actual Finish.",
  },
  read: {
    label: "Read Mode",
    note: "(optional)",
    detail:
      "Let the AI read this project's full schedule — every scenario (including locked ones), their activities, estimates, milestones, section headers, dependencies, and computed, recorded and planned dates, plus activity notes, descriptions, and checklist/deliverable items — so it can make context-aware edits. Required for dependency edits, reordering activities and updating progress.",
  },
} as const;
