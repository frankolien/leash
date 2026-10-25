"use client";

import { useEffect, useState } from "react";

/// The id of the last section whose top has passed the upper third of the screen, for the header
/// links. Read on scroll, at most once a frame.
export function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState("");
  const key = ids.join(" ");
  useEffect(() => {
    const list = key.split(" ");
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = "";
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= Math.min(220, window.innerHeight * 0.35)) current = id;
      }
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return active;
}
