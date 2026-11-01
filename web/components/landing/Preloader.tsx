"use client";

// Holds the landing page behind the mark and a spinner until the film can play through, the photos
// are in and the fonts are ready, then fades it in and starts the film from its first clip. It is
// in the server HTML, so it covers the page from the first paint. A slow network never keeps anyone
// out: after MAX_WAIT the page shows with whatever has arrived, and if scripts fail, a CSS timer
// lifts the cover on its own.

import { useEffect, useState } from "react";
import styles from "./preloader.module.css";

const MAX_WAIT = 7_000;

function videoReady(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (v.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return resolve();
    const done = () => resolve();
    v.addEventListener("canplaythrough", done, { once: true });
    v.addEventListener("error", done, { once: true });
  });
}

function imageReady(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });
}

export default function Preloader() {
  const [state, setState] = useState<"loading" | "leaving" | "gone">("loading");

  useEffect(() => {
    const root = document.documentElement;
    root.style.overflow = "hidden";
    let cancelled = false;
    // One frame later, so the film has picked its source for this screen size.
    const frame = requestAnimationFrame(() => {
      const video = document.querySelector<HTMLVideoElement>("video");
      // Lazy photos further down are fetched now too, so scrolling never meets an empty frame.
      const images = new Set<string>();
      for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
        if (img.src) images.add(img.src);
      }
      if (video?.poster) images.add(video.poster);
      const everything = Promise.all([video ? videoReady(video) : Promise.resolve(), ...[...images].map(imageReady), document.fonts.ready.then(() => undefined)]);
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, MAX_WAIT));
      Promise.race([everything, timeout]).then(() => {
        if (cancelled) return;
        if (video) {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
        root.style.overflow = "";
        setState("leaving");
        setTimeout(() => !cancelled && setState("gone"), 500);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      root.style.overflow = "";
    };
  }, []);

  if (state === "gone") return null;
  return (
    <div className={styles.cover} data-leaving={state === "leaving"} role="status" aria-live="polite">
      <span className={styles.mark} aria-hidden="true" />
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>Loading Leash</span>
    </div>
  );
}
