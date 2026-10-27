import { Suspense } from "react";
import type { Metadata } from "next";
import LinkPage from "@/components/connect/LinkPage";

export const metadata: Metadata = { title: "Link your phone" };

export default function Link() {
  return (
    <Suspense>
      <LinkPage />
    </Suspense>
  );
}
