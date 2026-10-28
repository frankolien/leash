import type { Metadata } from "next";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import styles from "./privacy.module.css";

export const metadata: Metadata = { title: "Privacy", description: "What Leash knows about you, where it is kept, and what it is never used for." };

export default function Privacy() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.prose}>
        <h1>Privacy</h1>
        <p className={styles.updated}>Last updated 28 October 2026</p>

        <p>
          Leash is a spending account for AI agents on NEAR. It is built to know as little about you as it can: there is no
          Leash database of users, no advertising and no analytics. This page says what does exist, and where.
        </p>

        <h2>Signing in</h2>
        <p>
          When you continue with Google, Apple, email or a passkey, the sign-in is handled by <a href="https://privy.io">Privy</a>,
          which receives what that method shares (for Google and Apple, your name and email address) and keeps your
          sign-in under <a href="https://www.privy.io/privacy-policy">Privy&apos;s privacy policy</a>. Privy creates a NEAR key for
          you; Leash never sees its private part. Leash receives a signed token that says you are signed in, uses it to check
          requests, and does not store it.
        </p>

        <h2>On the NEAR blockchain</h2>
        <p>
          Your NEAR account name, the agents you add and their limits, payments, requests and your decisions are recorded on
          the NEAR blockchain. That record is public by design, anyone can read it, and it cannot be deleted by Leash or by you.
          Leash runs on NEAR testnet today, with test tokens that have no value.
        </p>

        <h2>The Leash servers</h2>
        <ul>
          <li>When you first sign in, Leash pays the small fees to create and ready your NEAR account, and may send you test USDC.</li>
          <li>When you connect Claude or ChatGPT, Leash issues sealed tokens that the assistant keeps. Leash does not store them.</li>
          <li>Our host, Vercel, keeps request logs (such as IP address and time) for a short while to run and protect the service.</li>
        </ul>

        <h2>In your browser and on your phone</h2>
        <p>
          The web app keeps a few small preferences in your browser, such as which accounts it has already readied and the
          names you gave your agents. The Leash iPhone app keeps its two keys in the iPhone&apos;s Keychain, on that device only,
          and reads the blockchain directly. Its alerts are made on the phone.
        </p>

        <h2>What Leash never does</h2>
        <ul>
          <li>Sell or share your information with advertisers or data brokers.</li>
          <li>Track you across other sites or apps.</li>
          <li>Use your Google or Apple account for anything but signing you in.</li>
        </ul>

        <h2>Your choices</h2>
        <p>
          You can revoke any agent, remove a linked phone and sign out at any time. To have your Privy sign-in deleted, or for
          any question about this page, write to <a href="mailto:olien@frankolien.com">olien@frankolien.com</a>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
