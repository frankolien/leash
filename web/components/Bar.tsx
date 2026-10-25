"use client";

// The top line: whose dashboard, which network, who is connected, and the kill switch, which is
// never more than one tap away.

export default function Bar(props: {
  owner: string;
  network: string;
  account: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  busy?: string | null;
  canAct?: boolean;
}) {
  const { owner, network, account, onConnect, onDisconnect, paused, onPause, onResume, busy, canAct } = props;
  return (
    <header className="bar">
      <span className="owner mono">{owner}</span>
      <span className="pill glass" style={{ height: 28, fontSize: 12 }}>{network}</span>
      <span className="spacer" />
      {account ? (
        <button className="pill glass" onClick={onDisconnect} title="Disconnect">
          <span className={`dot ${account === owner ? "good" : "warn"}`} />
          <span className="mono">{account === owner ? "you" : account}</span>
        </button>
      ) : (
        <button className="pill glass" onClick={onConnect}>Connect</button>
      )}
      {onPause && (
        paused ? (
          <button className="pill bad on" onClick={onResume} disabled={busy !== null || !canAct}>Paused · Resume</button>
        ) : (
          <button className="pill bad" onClick={onPause} disabled={busy !== null || !canAct} title="Kill switch: no agent can pay until you resume">
            Pause all
          </button>
        )
      )}
    </header>
  );
}
