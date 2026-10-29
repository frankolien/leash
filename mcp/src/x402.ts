// Paying for an HTTP resource per request, the x402 way (v2). A server that wants paying answers
// 402 with a PAYMENT-REQUIRED header naming what it accepts; the client pays and repeats the request
// with PAYMENT-SIGNATURE; the server settles and answers with PAYMENT-RESPONSE. NEAR is one of the
// protocol's networks, but its standard payload needs a full-access key, which a Leash agent never
// holds. Leash is its own transfer method on that network: the payload is the agent's signed pay
// intent, and the server's facilitator delivers it to the Leash contract, which applies the limits.

export const X402_VERSION = 2;
export const METHOD = "leash";
export const NETWORK: Record<"testnet" | "mainnet", string> = { testnet: "near:testnet", mainnet: "near:mainnet" };

export type Requirements = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

export type Resource = { url: string; description?: string; mimeType?: string; serviceName?: string };

export type PaymentRequired = { x402Version: number; error?: string; resource: Resource; accepts: Requirements[]; extensions?: Record<string, unknown> };

export type LeashPayload = { intent: string; signature: string };

export type PaymentPayload = { x402Version: number; resource?: Resource; accepted: Requirements; payload: LeashPayload; extensions?: Record<string, unknown> };

export type Settlement = { success: boolean; errorReason?: string; payer?: string; transaction: string; network: string; amount?: string };

export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export function decodeHeader<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

/// Whether one accepted way of paying is a Leash payment on this agent's network and token.
export function isLeash(r: Requirements, network: "testnet" | "mainnet", token: string): boolean {
  return r.scheme === "exact" && r.network === NETWORK[network] && r.asset === token && r.extra?.assetTransferMethod === METHOD && /^\d+$/.test(r.amount);
}

/// The way of paying this agent can use, or, in words, why it cannot pay here at all.
export function choose(required: PaymentRequired, network: "testnet" | "mainnet", token: string): { accepted: Requirements } | { refusal: string } {
  if (required.x402Version !== X402_VERSION) return { refusal: `the server speaks x402 version ${required.x402Version}; this agent speaks ${X402_VERSION}` };
  const accepts = Array.isArray(required.accepts) ? required.accepts : [];
  const ours = accepts.filter((r) => isLeash(r, network, token));
  if (ours.length > 0) return { accepted: ours.reduce((a, b) => (BigInt(b.amount) < BigInt(a.amount) ? b : a)) };
  const near = accepts.filter((r) => r.network === NETWORK[network]);
  if (near.length > 0) return { refusal: `the server takes ${near[0].scheme} payments on ${near[0].network} only from a full-access key; this agent holds a Leash key, so the server would need to accept the leash transfer method` };
  const networks = [...new Set(accepts.map((r) => r.network))];
  return { refusal: networks.length ? `the server takes payment on ${networks.join(", ")}, not on ${NETWORK[network]}` : "the server named no way to pay" };
}

export function paymentPayload(required: PaymentRequired, accepted: Requirements, payload: LeashPayload): PaymentPayload {
  return { x402Version: X402_VERSION, resource: required.resource, accepted, payload };
}

/// The requirements a Leash-paid resource advertises, for servers.
export function requirements(network: "testnet" | "mainnet", token: string, contract: string, payTo: string, amount: string, maxTimeoutSeconds = 120): Requirements {
  return { scheme: "exact", network: NETWORK[network], amount, asset: token, payTo, maxTimeoutSeconds, extra: { assetTransferMethod: METHOD, contract } };
}
