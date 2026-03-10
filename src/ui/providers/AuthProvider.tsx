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
import { auth, isFirebaseAvailable } from "@infrastructure/firebase/firebase";
import { upsertUserProfile } from "@infrastructure/firebase/firestore-sharing";

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
        setUser(toAuthUser(firebaseUser));
        // Upsert profile on sign-in
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
