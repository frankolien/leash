import type { Metadata } from "next";
import AttackPage from "@/components/attack/AttackPage";

export const metadata: Metadata = {
  title: "Attack playground · Leash",
  description: "A prompt-injected agent tries to drain its owner on NEAR testnet, live, and is stopped at every turn.",
};

export default function Page() {
  return <AttackPage />;
}
