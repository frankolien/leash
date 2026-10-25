import type { Metadata } from "next";
import SignInPage from "@/components/auth/SignInPage";

export const metadata: Metadata = { title: "Sign in" };

export default function AppEntry() {
  return <SignInPage />;
}
