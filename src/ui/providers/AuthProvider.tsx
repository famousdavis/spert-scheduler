// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, isFirebaseAvailable } from "@infrastructure/firebase/firebase";
import { upsertUserProfile } from "@infrastructure/firebase/firestore-sharing";
import {
  TOS_VERSION,
  PRIVACY_POLICY_VERSION,
  APP_ID,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  firebaseAvailable: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(fbUser: FirebaseUser): AuthUser {
  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName,
    photoURL: fbUser.photoURL,
  };
}

// ── ToS Firestore helpers (used inside onAuthStateChanged) ──

/**
 * Branch A: User just accepted consent and signed in.
 * Write the acceptance record to Firestore with read-before-write pattern.
 */
async function writeTosAcceptance(fbUser: FirebaseUser): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, "users", fbUser.uid);
    const snap = await getDoc(docRef);

    const authProvider = fbUser.providerData[0]?.providerId ?? "unknown";

    if (!snap.exists()) {
      // Case (a): Document missing — full write including appId
      await setDoc(docRef, {
        acceptedAt: serverTimestamp(),
        tosVersion: TOS_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        appId: APP_ID,
        authProvider,
      });
    } else {
      const data = snap.data();
      if (data.tosVersion !== TOS_VERSION) {
        // Case (b): Version mismatch — merge write WITHOUT appId (preserves original first-acceptance app)
        await setDoc(
          docRef,
          {
            acceptedAt: serverTimestamp(),
            tosVersion: TOS_VERSION,
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
            authProvider,
          },
          { merge: true }
        );
      }
      // Case (c): Version matches — skip write
    }
  } catch (e) {
    // Firestore error — allow user through, do not block
    console.error("ToS acceptance write failed:", e);
  }

  // Always finalize localStorage state
  localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
  localStorage.removeItem(LS_TOS_WRITE_PENDING);
}

/**
 * Branch B: Returning user check.
 * Returns true if user should proceed, false if sign-out is needed.
 */
async function checkReturningUserTos(fbUser: FirebaseUser): Promise<boolean> {
  // Fast path: localStorage shows current version
  const cached = localStorage.getItem(LS_TOS_ACCEPTED_VERSION);
  if (cached === TOS_VERSION) return true;

  // No db means Firebase isn't fully configured — allow through
  if (!db) return true;

  try {
    const docRef = doc(db, "users", fbUser.uid);
    const snap = await getDoc(docRef);

    if (snap.exists() && snap.data().tosVersion === TOS_VERSION) {
      // Firestore has current version — cache locally and proceed
      localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
      return true;
    }

    // Document missing or version outdated — must re-accept
    return false;
  } catch (e) {
    // Firestore read failed (network error, permission denied) — allow through
    console.error("ToS version check failed:", e);
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // No loading state needed if Firebase not configured
  const [loading, setLoading] = useState(isFirebaseAvailable);

  useEffect(() => {
    if (!auth) return;

    // Check for redirect result on page load
    getRedirectResult(auth).catch((e) => {
      console.error("Redirect sign-in error:", e);
    });

    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const writePending =
          localStorage.getItem(LS_TOS_WRITE_PENDING) === "true";

        if (writePending) {
          // Branch A: Pending write — user just accepted consent and signed in
          await writeTosAcceptance(firebaseUser);
          setUser(toAuthUser(firebaseUser));
        } else {
          // Branch B: Returning user — verify ToS version
          const proceed = await checkReturningUserTos(firebaseUser);
          if (proceed) {
            setUser(toAuthUser(firebaseUser));
          } else {
            // Version mismatch — sign out; next onAuthStateChanged(null)
            // will handle setUser(null) + setLoading(false)
            localStorage.removeItem(LS_TOS_ACCEPTED_VERSION);
            localStorage.removeItem(LS_TOS_WRITE_PENDING);
            await firebaseSignOut(auth!);
            return;
          }
        }

        // Upsert profile on successful sign-in
        try {
          await upsertUserProfile(
            firebaseUser.uid,
            firebaseUser.displayName ?? "",
            firebaseUser.email ?? ""
          );
        } catch (e) {
          console.error("Failed to upsert profile:", e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch {
      // Popup blocked or failed — fall back to redirect
      await signInWithRedirect(auth, provider);
    }
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    if (!auth) return;
    const provider = new OAuthProvider("microsoft.com");
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch {
      // Popup blocked or failed — fall back to redirect
      await signInWithRedirect(auth, provider);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    localStorage.removeItem(LS_TOS_ACCEPTED_VERSION);
    localStorage.removeItem(LS_TOS_WRITE_PENDING);
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseAvailable: isFirebaseAvailable,
      signInWithGoogle,
      signInWithMicrosoft,
      signOut,
    }),
    [user, loading, signInWithGoogle, signInWithMicrosoft, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is tightly coupled to AuthProvider
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
