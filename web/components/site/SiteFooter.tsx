import styles from "./site.module.css";

const LIVE = "/frankolien.testnet";

export default function SiteFooter() {
  return (
    <footer className={styles.footerShell}>
      <div className={styles.footer}>
        <div className={styles.footerLead}>
          <span className="wordmark"><span className="mark" aria-hidden="true" />Leash</span>
          <p>A budget for AI agents, enforced on NEAR.</p>
        </div>
        <nav aria-label="Footer" className={styles.footerGroups}>
          <div><h2>Product</h2><a href="/#limits">Limits</a><a href="/#approvals">Approvals</a><a href="/#kill-switch">Kill switch</a></div>
          <div><h2>Try it</h2><a href="/#open">Open a dashboard</a><a href={LIVE}>Live testnet dashboard</a></div>
          <div><h2>Built on</h2><a href="https://near.org" rel="noreferrer">NEAR Protocol</a><a href="https://modelcontextprotocol.io" rel="noreferrer">Model Context Protocol</a></div>
        </nav>
      </div>
    </footer>
  );
}
