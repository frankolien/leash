"use client";

// Opens an owner's dashboard by account id. The network follows from the suffix, so there is
// nothing else to ask.

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./sections.module.css";

export default function OpenForm() {
  const router = useRouter();
  const [owner, setOwner] = useState("");
  const id = owner.trim().toLowerCase();
  return (
    <form className={styles.openForm} onSubmit={(e) => { e.preventDefault(); if (id) router.push(`/${encodeURIComponent(id)}`); }}>
      <label htmlFor="owner">Or open any account, read only</label>
      <div>
        <input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="you.near or you.testnet" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button className="btn ink" type="submit" disabled={!id}>Open</button>
      </div>
    </form>
  );
}
