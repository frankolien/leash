"use client";

// The log, newest first. One row per on-chain event: an icon toned by meaning, a line, a time, the
// amount on the right in mono.

import { DETAIL_IN_TITLE, describe } from "@/lib/activity";
import { agentLabel, msOf, toUsdc } from "@/lib/format";
import type { LogEntry, Names } from "@/lib/types";

export default function Activity({ log, names }: { log: LogEntry[]; names: Names }) {
  return (
    <div className="rows">
      {log.length === 0 && (
        <div className="row">
          <div className="icon">·</div>
          <div><div className="title quiet">No activity yet</div></div>
          <div />
        </div>
      )}
      {log.map((e, i) => <Row key={`${e.at}-${i}`} entry={e} names={names} />)}
    </div>
  );
}

function Row({ entry: e, names }: { entry: LogEntry; names: Names }) {
  const who = e.key ? agentLabel(e.key, names) : "you";
  const { tone, glyph, title } = describe(e, who);
  const when = new Date(msOf(e.at));
  const detail = e.detail && !DETAIL_IN_TITLE.has(e.event) ? ` · ${e.detail}` : "";
  return (
    <div className="row">
      <div className={`icon ${tone}`}>{glyph}</div>
      <div>
        <div className="title">{title}</div>
        <div className="when">{when.toLocaleString()}{detail}</div>
      </div>
      <div className={`value${e.amount ? "" : " muted"}`}>{e.amount ? `$${toUsdc(e.amount)}` : ""}</div>
    </div>
  );
}
