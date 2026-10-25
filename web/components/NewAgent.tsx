// The empty tile at the end of the agents grid: how a new key is granted.

export default function NewAgent() {
  return (
    <div className="agent-new">
      <span className="eyebrow">New agent</span>
      <span>Grant a key from the CLI; it appears here within ten seconds.</span>
      <code>leash grant --name codex --daily 5 --per-payment 2</code>
    </div>
  );
}
