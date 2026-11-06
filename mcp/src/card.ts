// The card Claude and ChatGPT draw in the chat beside a Leash answer (MCP Apps). The host renders
// this page in a sandboxed frame and posts the tool's result to it; the page draws the payment, the
// parked request or the budget, and opens links through the host. Approval itself never happens in
// here: the owner approves on their own Leash page, so no owner key ever enters the agent's host.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const CARD_URI = "ui://leash/card-2.html";
const MIME = "text/html;profile=mcp-app";

/// Tool metadata that tells hosts to draw the card for this tool's results.
export const CARD_META = { ui: { resourceUri: CARD_URI }, "ui/resourceUri": CARD_URI };

export type Card = {
  kind: "paid" | "refused" | "parked" | "status";
  agent?: string | null;
  usdc?: string | null;
  to?: string;
  reason?: string | null;
  remaining_usdc?: string | null;
  daily_usdc?: string | null;
  per_payment_usdc?: string | null;
  vault_usdc?: string | null;
  tx_url?: string | null;
  approve_url?: string | null;
  expires_at?: string | null;
  raised_until?: string | null;
  warnings?: string[];
};

/// Hosts cache a connector's tool list, so a client connected before the address changed still asks
/// for the old one; both addresses serve the same card.
const OLD_CARD_URI = "ui://leash/card.html";

export function registerCard(server: McpServer) {
  for (const [name, uri] of [["leash-card", CARD_URI], ["leash-card-v1", OLD_CARD_URI]] as const) {
    server.registerResource(name, uri, { mimeType: MIME, description: "Leash payment card" }, async () => ({
      contents: [{ uri, mimeType: MIME, text: CARD_HTML }],
    }));
  }
}

export const CARD_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#ffffff;--card:#f6f6f4;--text:#111;--muted:#6b6b6b;--line:#e4e4e0;--bar:#111;--bad:#c4372f;--chip:#ececea}
:root[data-theme=dark]{--bg:#0b0b0b;--card:#171717;--text:#fff;--muted:#8a8a8a;--line:#2b2b2b;--bar:#fff;--bad:#f2726b;--chip:#242424}
*{box-sizing:border-box}html,body{margin:0;background:var(--card);color:var(--text);font:15px/1.4 Inter,-apple-system,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.card{display:flex;flex-direction:column;gap:14px;padding:18px 20px;border-radius:20px;background:var(--card);border:1px solid var(--line);width:100%}
.top{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:13px;font-weight:500}
.brand{display:inline-flex;align-items:center;gap:7px}.brand i{width:14px;height:14px;border-radius:50%;border:2.5px solid currentColor;position:relative}.brand i::after{content:"";position:absolute;inset:2px;border-radius:50%;background:currentColor}
.state{padding:3px 10px;border-radius:999px;background:var(--chip);color:var(--text);font-weight:600}.state.bad{color:var(--bad)}
.amount{font-size:34px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.amount small{font-size:16px;font-weight:500;color:var(--muted);margin-left:6px;letter-spacing:0}
.to{color:var(--muted)}.to b{color:var(--text);font-weight:600}
.reason{padding:10px 12px;border-radius:12px;background:var(--chip);font-size:14px}.reason.bad{color:var(--bad)}
.bar{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)}.track{height:6px;border-radius:6px;background:var(--line);overflow:hidden}.fill{height:100%;background:var(--bar);border-radius:6px}
.row{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--muted)}.row b{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.warn{font-size:13px;color:var(--bad)}
.actions{display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;font-size:14px;font-weight:600;border:0;border-radius:999px;padding:9px 16px;cursor:pointer;background:var(--chip);color:var(--text)}button.primary{background:var(--text);color:var(--bg)}
.hidden{display:none}
</style></head>
<body><div class="card hidden" id="card"></div>
<script>
(() => {
  let next = 1; const pending = new Map();
  const post = (msg) => window.parent.postMessage(msg, "*");
  const request = (method, params) => new Promise((resolve) => { const id = next++; pending.set(id, resolve); post({ jsonrpc: "2.0", id, method, params }); });
  const notify = (method, params) => post({ jsonrpc: "2.0", method, params });
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (s) => "$" + Number(s ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const el = document.getElementById("card");

  function resize() { notify("ui/notifications/size-changed", { height: Math.ceil(document.documentElement.getBoundingClientRect().height) }); }

  function bar(c) {
    if (c.daily_usdc == null || c.remaining_usdc == null) return "";
    const daily = Number(c.daily_usdc), left = Number(c.remaining_usdc);
    const pct = daily > 0 ? Math.max(0, Math.min(100, (left / daily) * 100)) : 0;
    return '<div class="bar"><div class="row"><span>Left today</span><b>' + money(left) + " of " + money(daily) + '</b></div><div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>';
  }

  function draw(c) {
    const who = c.agent ? esc(c.agent) : "Your agent";
    const head = (label, bad) => '<div class="top"><span class="brand"><i></i>Leash</span><span class="state' + (bad ? " bad" : "") + '">' + label + "</span></div>";
    let html = "";
    if (c.kind === "paid") {
      html = head("Paid") + '<div><div class="amount">' + money(c.usdc) + '<small>USDC</small></div><div class="to">to <b>' + esc(c.to) + "</b></div></div>" + bar(c);
    } else if (c.kind === "refused") {
      html = head("Not paid", true) + '<div><div class="amount">' + money(c.usdc) + '<small>USDC</small></div><div class="to">to <b>' + esc(c.to) + '</b></div></div><div class="reason bad">' + esc(c.reason) + ". Nothing moved.</div>" + bar(c);
    } else if (c.kind === "parked") {
      html = head("Waiting for you") + '<div><div class="amount">' + money(c.usdc) + '<small>USDC</small></div><div class="to">' + who + " wants to pay <b>" + esc(c.to) + '</b></div></div><div class="reason">' + esc(c.reason) + (c.expires_at ? " &middot; decide by " + new Date(c.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "") + "</div>";
    } else {
      html = head(c.raised_until ? "Raised" : "Budget") + bar(c) + '<div class="row"><span>Pays alone up to</span><b>' + money(c.per_payment_usdc) + '</b></div><div class="row"><span>In the vault</span><b>' + money(c.vault_usdc) + "</b></div>" + (c.raised_until ? '<div class="row"><span>Raise ends</span><b>' + new Date(c.raised_until).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) + "</b></div>" : "");
    }
    for (const w of c.warnings ?? []) html += '<div class="warn">' + esc(w) + "</div>";
    const buttons = [];
    if (c.approve_url) buttons.push('<button class="primary" data-href="' + esc(c.approve_url) + '">Approve in Leash</button>');
    if (c.tx_url) buttons.push('<button data-href="' + esc(c.tx_url) + '">View on NEAR</button>');
    if (buttons.length) html += '<div class="actions">' + buttons.join("") + "</div>";
    el.innerHTML = html;
    el.classList.remove("hidden");
    for (const b of el.querySelectorAll("button[data-href]")) b.addEventListener("click", () => request("ui/open-link", { url: b.dataset.href }));
    resize();
  }

  function theme(ctx) { if (ctx && ctx.theme) document.documentElement.dataset.theme = ctx.theme; }

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === "ui/notifications/host-context-changed") theme(m.params);
    if (m.method === "ui/notifications/tool-result") {
      const r = m.params || {};
      let card = r.structuredContent && r.structuredContent.card;
      if (!card) { try { card = JSON.parse(r.content[0].text).card; } catch {} }
      if (card) draw(card);
    }
  });

  request("ui/initialize", { appInfo: { name: "leash-card", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" }).then((res) => {
    theme(res && res.hostContext);
    notify("ui/notifications/initialized", {});
  });
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";
})();
</script></body></html>`;
