"use client";

import { useCallback, useRef, useState } from "react";

export type Toast = { text: string; bad?: boolean };

/// One line at the bottom of the page that says what just happened, gone after four seconds.
export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | null>(null);

  const say = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  return { toast, say };
}
