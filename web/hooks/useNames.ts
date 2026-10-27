"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent, Names, Task } from "@/lib/types";

/// Agent names: on chain from each key's policy, with any name the owner set in this browser
/// winning, and a task's sub-agent as "claude › research". Local names are a convenience stored in
/// localStorage and never leave the device.
export function useNames(owner: string, agents: Agent[] | undefined, tasks: Task[] | undefined): Names {
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
    const parents = { ...onChain, ...local };
    const children = Object.fromEntries((tasks ?? []).map((t) => [t.child, `${parents[t.parent] ?? "agent"} › ${t.label}`]));
    return { ...children, ...parents };
  }, [agents, tasks, local]);
}
