"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent, Names } from "@/lib/types";

/// Agent names: on chain from each key's policy, with any name the owner set in this browser
/// winning. Local names are a convenience stored in localStorage and never leave the device.
export function useNames(owner: string, agents: Agent[] | undefined): Names {
  const [local, setLocal] = useState<Names>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`leash.names.${owner}`);
      setLocal(raw ? (JSON.parse(raw) as Names) : {});
    } catch {
      setLocal({});
    }
  }, [owner]);

  return useMemo(() => {
    const onChain = Object.fromEntries((agents ?? []).filter((a) => a.policy.name).map((a) => [a.key, a.policy.name as string]));
    return { ...onChain, ...local };
  }, [agents, local]);
}
