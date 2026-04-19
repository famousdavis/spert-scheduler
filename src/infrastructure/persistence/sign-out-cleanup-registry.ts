// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Module-level single-slot registry that lets `StorageProvider` hand a
 * cleanup function to `AuthProvider` without crossing the
 * `AuthProvider → StorageProvider` context boundary.
 *
 * Usage:
 *   StorageProvider.useEffect(() => {
 *     registerSignOutCleanup(performCleanup);
 *     return () => clearSignOutCleanup();
 *   }, []);
 *
 *   AuthProvider.signOut = async () => {
 *     await runSignOutCleanup();     // cancel pending saves, zero state, clear keys
 *     await firebaseSignOut(auth);   // revoke credentials last
 *   };
 *
 * "Last registration wins" semantics: safe under React 18 StrictMode
 * double-mount because the second mount simply re-registers the same
 * closure. runSignOutCleanup swallows errors so a partial cleanup failure
 * never blocks `firebaseSignOut` — leaving the user in a half-authenticated
 * state would be worse than running sign-out with a noisy log.
 */

let registered: (() => Promise<void>) | null = null;

export function registerSignOutCleanup(fn: () => Promise<void>): void {
  registered = fn;
}

export function clearSignOutCleanup(): void {
  registered = null;
}

export async function runSignOutCleanup(): Promise<void> {
  if (!registered) return;
  try {
    await registered();
  } catch (e) {
    console.error("Sign-out cleanup failed:", e);
  }
}
