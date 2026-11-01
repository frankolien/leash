#!/usr/bin/env node
// leash: the owner's side. Deploy a Leash contract, fund it, hand out bounded keys to agents, and
// decide what the agents could not decide for themselves.
//
// The owner's own key never leaves ~/.near-credentials. Agent keys are written to ~/.leash/<name>.json
// and are useless anywhere but the Leash contract.

import { parseArgs } from "node:util";
import { grant, revoke } from "./commands/agents.js";
import { decide, dismiss, report, reports, retract, simple, window } from "./commands/decisions.js";
import { deposit, register, withdraw } from "./commands/money.js";
import { log, proposals, requests, status } from "./commands/read.js";
import { init } from "./commands/setup.js";
import { usage } from "./usage.js";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      owner: { type: "string" },
      network: { type: "string" },
      wasm: { type: "string" },
      token: { type: "string" },
      "owner-key": { type: "string" },
      name: { type: "string" },
      daily: { type: "string" },
      "per-payment": { type: "string" },
      to: { type: "string" },
      cooldown: { type: "string" },
      ttl: { type: "string" },
      force: { type: "boolean" },
      evidence: { type: "string" },
    },
  });
  const [command, arg] = positionals;
  const flags = values as unknown as Record<string, string | undefined>;
  switch (command) {
    case "init": return init(flags);
    case "deposit": return deposit(arg ?? usage());
    case "withdraw": return withdraw(arg ?? usage());
    case "grant": return grant(flags);
    case "revoke": return revoke(arg ?? usage());
    case "pause": return simple("pause");
    case "resume": return simple("resume");
    case "approve": return decide("approve", arg ?? usage(), values.force === true);
    case "deny": return decide("deny", arg ?? usage());
    case "register": return register(arg ?? usage());
    case "proposals": return proposals();
    case "dismiss": return dismiss(arg ?? usage());
    case "window": return window(arg ?? usage());
    case "report": return report(arg ?? usage(), values.evidence);
    case "retract": return retract(arg ?? usage());
    case "reports": return reports(arg ?? usage());
    case "status": return status();
    case "requests": return requests();
    case "log": return log();
    default: usage();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
