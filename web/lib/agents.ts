// Making an agent, wherever the owner starts it (the dashboard's New agent panel or the Allow page a
// Claude or ChatGPT connector opens). The key pair is made in this browser; the owner signs twice:
// once to add the key to their account, limited to the Leash contract, and once to set its limits.

import { KeyPair } from "near-api-js";
import { AGENT_ALLOWANCE, AGENT_METHODS } from "./config";
import { toUnits } from "./format";
import type { OwnerSession } from "./session";

export type Limits = { name: string; daily: string; perPayment: string; recipients: string[] };

/// What the agent keeps: the same shape as a key file from `leash grant`. `relay` is this site's
/// relay, so the agent signs instructions and never needs NEAR for gas.
export type AgentKey = { name: string; owner: string; public_key: string; private_key: string; contract: string; network: string; token: string; relay: string };

export function limitsProblem(l: Limits): string | null {
  if (!/^[a-z0-9-]{1,32}$/.test(l.name)) return "Name it with lowercase letters, numbers and -.";
  if (!(Number(l.daily) > 0)) return "Set a daily limit above $0.";
  if (!(Number(l.perPayment) > 0)) return "Set how much it may pay alone, above $0.";
  if (Number(l.perPayment) > Number(l.daily)) return "It cannot pay alone more than its daily limit.";
  return null;
}

export async function createAgent(session: OwnerSession, contract: string, token: string, limits: Limits, onStep: (step: string) => void = () => {}): Promise<AgentKey> {
  const pair = KeyPair.fromRandom("ed25519");
  const publicKey = pair.getPublicKey().toString();
  onStep("Adding the agent's key to your account");
  await session.addAgentKey(publicKey, contract, AGENT_METHODS, AGENT_ALLOWANCE);
  onStep("Setting its limits on Leash");
  await session.call(contract, "set_policy", {
    public_key: publicKey,
    policy: {
      name: limits.name,
      token,
      daily_cap: toUnits(limits.daily).toString(),
      per_payment_cap: toUnits(limits.perPayment).toString(),
      allowlist: limits.recipients,
      cooldown_secs: 0,
      expires_at: 0,
    },
  });
  return { name: limits.name, owner: session.accountId, public_key: publicKey, private_key: pair.toString(), contract, network: session.network, token, relay: `${location.origin}/api/relay` };
}
