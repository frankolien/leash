"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [owner, setOwner] = useState("");
  return (
    <main className="landing">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const id = owner.trim().toLowerCase();
          if (id) router.push(`/${encodeURIComponent(id)}`);
        }}
      >
        <span className="eyebrow">Leash</span>
        <h1 className="statement">Your agents, on a leash.</h1>
        <p className="quiet">Open any owner&apos;s dashboard by account. Connect that account&apos;s wallet to approve, pause or revoke.</p>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="you.near or you.testnet"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Owner account"
        />
        <button className="pill accent" type="submit" style={{ height: 48, justifyContent: "center" }}>Open</button>
      </form>
    </main>
  );
}
