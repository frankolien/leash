import styles from "./site.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerLead}>
          <span className="wordmark"><span className="mark" aria-hidden="true" />Leash</span>
          <p>A spending account for AI agents, enforced on NEAR.</p>
        </div>
        <nav aria-label="Footer" className={styles.footerGroups}>
          <div><h2>Product</h2><a href="/#how">How it holds</a><a href="/#stories">What people use it for</a><a href="/#faq">Questions</a></div>
          <div><h2>Try it</h2><a href="/#open">Open a dashboard</a><a href="/frankolien.testnet">Live testnet dashboard</a></div>
          <div><h2>Built on</h2><a href="https://near.org" rel="noreferrer">NEAR Protocol</a><a href="https://modelcontextprotocol.io" rel="noreferrer">Model Context Protocol</a></div>
        </nav>
      </div>
      <div className={styles.footerBase}>
        <span>Leash is open source and runs on NEAR testnet today.</span>
        <span>Built for the NEAR Hackathon, November 2026.</span>
      </div>
    </footer>
  );
}
