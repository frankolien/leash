import type { Metadata } from "next";
import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";

type Params = { owner: string };
type Search = { contract?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner } = await params;
  return { title: `${owner} · Leash` };
}

// The owner comes from the URL, so this route is rendered per request; Suspense keeps the shell
// instant while the params resolve.
async function Owner({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { owner } = await params;
  const { contract } = await searchParams;
  return <Dashboard owner={decodeURIComponent(owner)} contract={contract} />;
}

export default function OwnerPage(props: { params: Promise<Params>; searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<main className="page"><p className="quiet">Reading the chain…</p></main>}>
      <Owner {...props} />
    </Suspense>
  );
}
