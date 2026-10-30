// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the × close buttons' contrast (WI-116, v0.79.31).
//
// The × that closes the Share, Connect AI and Storage & Sign In windows is text-gray-500 in light (4.84 : 1 on the
// white window), where it was text-gray-400 (2.60 : 1). Each straw puts one button's light colour back to gray-400
// and must fail exactly that button's "light, at rest" row — its hover and dark rows keep their own classes, so they
// hold. Read "K failing; named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test fails.
// Each straw was run ALONE first; its expected set is what that run observed.
const SHARE = new URL("../src/ui/components/ShareProjectModal.tsx", import.meta.url).pathname;
const CONNECT_AI = new URL("../src/ui/components/ConnectAI/ConnectAiPanel.tsx", import.meta.url).pathname;
const STORAGE = new URL("../src/ui/components/StorageLoginModal.tsx", import.meta.url).pathname;

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const SHARE_LIGHT = "ShareProjectModal.tsx — light, at rest";
const CONNECT_AI_LIGHT = "ConnectAiPanel.tsx — light, at rest";
const STORAGE_LIGHT = "StorageLoginModal.tsx — light, at rest";

export const testFile = "src/ui/components/close-button-contrast.test.ts";
export const mutations = [
  {
    id: "C1  the Share window's × back to text-gray-400  [expect 1: Share light at rest]",
    file: SHARE,
    find: 'className="shrink-0 p-1 text-gray-500 hover:text-gray-700',
    replace: 'className="shrink-0 p-1 text-gray-400 hover:text-gray-700',
    expectFailing: only(SHARE_LIGHT),
  },
  {
    id: "C2  the Connect AI panel's × back to text-gray-400  [expect 1: Connect AI light at rest]",
    file: CONNECT_AI,
    find: 'className="shrink-0 p-1 text-gray-500 hover:text-gray-700',
    replace: 'className="shrink-0 p-1 text-gray-400 hover:text-gray-700',
    expectFailing: only(CONNECT_AI_LIGHT),
  },
  {
    id: "C3  the Storage & Sign In window's × back to text-gray-400  [expect 1: Storage light at rest]",
    file: STORAGE,
    find: 'className="text-gray-500 hover:text-gray-700 dark:text-gray-400',
    replace: 'className="text-gray-400 hover:text-gray-700 dark:text-gray-400',
    expectFailing: only(STORAGE_LIGHT),
  },
];
