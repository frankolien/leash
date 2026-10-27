"use client";

// Where the Leash iPhone app sends the owner to link it. They sign in as they would on the web, check
// the code matches their phone and allow it; this browser adds the phone's key, limited to their
// decisions on Leash, and hands the account name back to the app.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Smartphone } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { SignInCard } from "@/components/auth/SignInDialog";
import { contractOf, shortAccount } from "@/lib/config";
import { PHONE_ALLOWANCE, PHONE_METHODS, callbackUrl, linkRequest, pairingCode } from "@/lib/device";
import { plainError } from "@/lib/errors";
import styles from "./connect.module.css";

export default function LinkPage() {
  const params = useSearchParams();
  const request = linkRequest(params);
  const { session, card, showInline, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => showInline(), [showInline]);

  // The app's own Google and Apple buttons land here; go straight on to that provider's account
  // picker instead of making the person choose again. Once only, so a cancelled picker shows the card.
  const provider = params.get("provider");
  const started = useRef(false);
  useEffect(() => {
    if (session || started.current || !card.ready || !card.embedded) return;
    if (provider !== "google" && provider !== "apple") return;
    started.current = true;
    // Coming back from the provider the URL still says which one; the flag stops a second trip.
    try {
      if (params.has("privy_oauth_code") || sessionStorage.getItem("leash.linkOAuth")) return;
      sessionStorage.setItem("leash.linkOAuth", "1");
    } catch {}
    card.embedded.oauth(provider).catch((e) => console.warn("Leash: sign-in did not start", e));
  }, [session, card.ready, card.embedded, provider]);

  const key = "error" in request ? null : request.key;
  useEffect(() => {
    if (key) pairingCode(key).then(setCode);
  }, [key]);

  async function allow() {
    if (!session || "error" in request) return;
    setProblem(null);
    setStep("Adding your phone's key");
    try {
      await session.addAgentKey(request.key, contractOf(session.accountId), PHONE_METHODS, PHONE_ALLOWANCE);
      setStep("Opening Leash on your phone");
      window.location.assign(callbackUrl(request, { account: session.accountId, network: session.network }));
    } catch (e) {
      console.warn("Leash: linking the phone failed", e);
      setProblem(plainError(e));
      setStep(null);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="link-title">
        <div className={styles.pair} aria-hidden="true">
          <span className={styles.appMark}><Smartphone size={26} strokeWidth={1.8} /></span>
          <span className={styles.link} />
          <span className={styles.leashMark} />
        </div>

        {"error" in request ? (
          <>
            <h1 id="link-title">Can't link</h1>
            <p className={styles.lead}>{request.error}</p>
          </>
        ) : !session ? (
          <>
            <p className={styles.kicker}>Sign in to link {request.device}</p>
            <div className={styles.signIn}>{card.ready ? <SignInCard {...card} startAt={provider === "email" ? "email" : undefined} /> : <div className={styles.status}><Loader2 size={20} className={styles.spin} /></div>}</div>
          </>
        ) : step ? (
          <>
            <h1 id="link-title">Linking {request.device}</h1>
            <div className={styles.status} role="status"><Loader2 size={20} className={styles.spin} />{step}…</div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); allow(); }} className={styles.allow}>
            <h1 id="link-title">Approve payments from {request.device}</h1>
            <p className={styles.lead}>
              For <b>{shortAccount(session.accountId)}</b>.{" "}
              <button type="button" className={styles.textButton} onClick={() => signOut()}>Not you?</button>
            </p>
            <div className={styles.code}>
              <span>Your phone shows</span>
              <b className="mono">{code || "…"}</b>
            </div>
            <ul className={styles.terms}>
              <li>It can approve or deny what your agents ask for.</li>
              <li>It can pause everything and revoke an agent.</li>
              <li>It cannot send your money anywhere else or add keys.</li>
            </ul>
            {problem && <p className={styles.error} role="alert">{problem}</p>}
            <button className={styles.white} disabled={!code}>Link {request.device}</button>
            <button type="button" className={styles.textButton} onClick={() => window.location.assign(callbackUrl(request, { error: "cancelled" }))}>Cancel</button>
            <small className={styles.fine}>Only link if the code matches the one on your phone. Unlink it any time in Settings.</small>
          </form>
        )}
      </section>
    </main>
  );
}
