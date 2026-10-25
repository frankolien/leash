"use client";

// Opens an owner's dashboard by account id. The network follows from the suffix, so there is
// nothing else to ask.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import styles from "./closing.module.css";

export default function OpenForm() {
  const router = useRouter();
  const [owner, setOwner] = useState("");
  return (
    <form
      className={styles.openForm}
      onSubmit={(e) => {
        e.preventDefault();
        const id = owner.trim().toLowerCase();
        if (id) router.push(`/${encodeURIComponent(id)}`);
      }}
    >
      <label htmlFor="owner">Your NEAR account</label>
      <div>
        <input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="you.near or you.testnet" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button className="pill primary" type="submit" disabled={!owner.trim()}>Open <ArrowUpRight size={15} /></button>
      </div>
      <small>Anyone can read a dashboard. Only the owner&apos;s wallet can approve, pause or revoke.</small>
    </form>
  );
}
