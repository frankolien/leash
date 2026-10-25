"use client";

// Wraps the app in sign-in. With a Privy app id, people can sign in with Google, Apple or email
// and get an embedded wallet; without one, NEAR wallets are the only way in.

import type { ReactNode } from "react";
import { AuthCore } from "./AuthContext";
import PrivyBridge from "./PrivyBridge";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <AuthCore embedded={null}>{children}</AuthCore>;
  return <PrivyBridge appId={appId} clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}>{children}</PrivyBridge>;
}
