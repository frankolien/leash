"use client";

import { useEffect, useState } from "react";
import { JsonRpcProvider } from "near-api-js";
import { RPC } from "@/lib/config";
import type { RecipientFacts } from "@/lib/safety";
import type { Network } from "@/lib/types";

const EMPTY_CODE = "11111111111111111111111111111111";

/// What the chain says about a recipient: whether the account exists, whether it is a contract,
/// and whether it can hold the token. Null until read; a failed read leaves it null so no check
/// claims more than it knows.
export function useRecipientFacts(network: Network, token: string, to: string): RecipientFacts | null {
  const [facts, setFacts] = useState<RecipientFacts | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFacts(null);
    const provider = new JsonRpcProvider({ url: RPC[network] });
    (async () => {
      const view = await provider.viewAccount({ accountId: to }).catch(() => null);
      const registered = view ? await provider.callFunction({ contractId: token, method: "storage_balance_of", args: { account_id: to } }).then((r) => r !== null, () => false) : false;
      if (!cancelled) setFacts({ exists: view !== null, isContract: !!view && view.code_hash !== EMPTY_CODE, registered });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [network, token, to]);
  return facts;
}
