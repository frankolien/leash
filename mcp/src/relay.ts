// Delivering signed instructions. An agent signs; a relayer sends the transaction and pays its gas.
// The relayer can neither forge nor repeat a payment: the contract checks the signature and the
// payment id. The hosted Leash server relays in process; a laptop agent uses LEASH_RELAY_URL.

export type SignedMethod = "pay_signed" | "request_signed" | "ask_more_signed" | "open_task_signed" | "close_task_signed";
export type Relayed = { result: unknown; tx?: string };
export type Relay = (method: SignedMethod, args: { intent: string; signature: string }) => Promise<Relayed>;

/// The relay never answered: nothing was sent, so the agent may send it itself.
export class RelayUnreachable extends Error {}

export function httpRelay(url: string): Relay {
  return async (method, args) => {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, ...args }) });
    } catch (error) {
      throw new RelayUnreachable(`the relay at ${url} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    }
    const body = (await res.json().catch(() => ({}))) as Relayed & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `the relay answered ${res.status}`);
    return { result: body.result, tx: body.tx };
  };
}
