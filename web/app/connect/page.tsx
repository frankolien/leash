import { Suspense } from "react";
import type { Metadata } from "next";
import ConnectPage from "@/components/connect/ConnectPage";

export const metadata: Metadata = { title: "Connect" };

export default function Connect() {
  return (
    <Suspense>
      <ConnectPage />
    </Suspense>
  );
}
