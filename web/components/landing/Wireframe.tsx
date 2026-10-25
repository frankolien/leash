"use client";

// Line drawings of small block structures, turning slowly, one per step of how the leash holds.
// Drawn on a 2D canvas with an orthographic projection: no WebGL context per card, and nothing runs
// while the card is off screen.

import { useEffect, useRef } from "react";

type V = [number, number, number];
export type Figure = "limits" | "key" | "checks" | "revoke";

const CUBE: V[] = [[0, 0, 0], [2, 0, 0], [0, 2, 0], [2, 2, 0], [0, 0, 2], [2, 0, 2], [0, 2, 2], [2, 2, 2]].map(([x, y, z]) => [x / 2, y / 2, z / 2]) as V[];
const EDGES: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const INK = "#111312";
const LEAF = "#1e5b3e";

function grid(skip?: string): V[] {
  const out: V[] = [];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) if (`${x}${y}${z}` !== skip) out.push([x, y, z]);
  return out;
}

/// Unique edges of a set of unit blocks, so shared faces are drawn once.
function edges(blocks: V[], offset: (b: V) => V = () => [0, 0, 0]): [V, V][] {
  const seen = new Map<string, [V, V]>();
  for (const b of blocks) {
    const o = offset(b);
    for (const [i, j] of EDGES) {
      const a: V = [b[0] + CUBE[i][0] + o[0], b[1] + CUBE[i][1] + o[1], b[2] + CUBE[i][2] + o[2]];
      const c: V = [b[0] + CUBE[j][0] + o[0], b[1] + CUBE[j][1] + o[1], b[2] + CUBE[j][2] + o[2]];
      const k = [a, c].map((p) => p.map((n) => n.toFixed(3)).join(",")).sort().join("|");
      seen.set(k, [a, c]);
    }
  }
  return [...seen.values()];
}

/// The twelve edges of one box between two corners.
function box(lo: V, hi: V): [V, V][] {
  const c = (i: number): V => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  return [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].map(([a, b]) => [c(a), c(b)]);
}

function scene(figure: Figure, t: number): { lines: [V, V][]; color: string; alpha: number }[] {
  const wave = (Math.sin(t * 1.4) + 1) / 2;
  switch (figure) {
    case "limits": {
      const pad = 0.26 + wave * 0.08;
      return [
        { lines: edges(grid()), color: INK, alpha: .9 },
        { lines: box([-pad, -pad, -pad], [2 + pad, 2 + pad, 2 + pad]), color: LEAF, alpha: .9 },
      ];
    }
    case "key": {
      const lift = 0.35 + wave * 0.35;
      return [
        { lines: edges(grid("111")), color: INK, alpha: .9 },
        { lines: edges([[1, 1, 1]], () => [lift, lift * .6, lift]), color: LEAF, alpha: 1 },
      ];
    }
    case "checks": {
      const gap = 0.3 + wave * 0.3;
      return [
        { lines: box([0, -gap, 0], [2, 0.5 - gap, 2]), color: INK, alpha: .9 },
        { lines: box([0, 0.75, 0], [2, 1.25, 2]), color: LEAF, alpha: 1 },
        { lines: box([0, 1.5 + gap, 0], [2, 2 + gap, 2]), color: INK, alpha: .9 },
      ];
    }
    case "revoke": {
      const fade = Math.max(0, Math.cos(t * .9));
      return [
        { lines: edges(grid("111")), color: INK, alpha: .9 },
        { lines: edges([[1, 1, 1]]), color: LEAF, alpha: fade * .9 },
      ];
    }
  }
}

export default function Wireframe({ figure, label }: { figure: Figure; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d")!;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = false;
    let start = performance.now();

    const draw = (now: number) => {
      const t = calm ? 1.2 : (now - start) / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const yaw = 0.7 + t * 0.22;
      const pitch = -0.52;
      const size = Math.min(w, h) * 0.25;
      const project = ([x, y, z]: V): [number, number] => {
        const cx = x - 1, cy = y - 1, cz = z - 1;
        const rx = cx * Math.cos(yaw) - cz * Math.sin(yaw);
        const rz = cx * Math.sin(yaw) + cz * Math.cos(yaw);
        const ry = cy * Math.cos(pitch) - rz * Math.sin(pitch);
        return [w / 2 + rx * size, h / 2 - ry * size];
      };
      g.lineWidth = 1.1;
      g.lineCap = "round";
      for (const layer of scene(figure, t)) {
        g.strokeStyle = layer.color;
        g.globalAlpha = layer.alpha;
        g.beginPath();
        for (const [a, b] of layer.lines) {
          const [ax, ay] = project(a);
          const [bx, by] = project(b);
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      if (!calm && visible) frame = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) { start = performance.now() - 2000; frame = requestAnimationFrame(draw); }
    });
    io.observe(canvas);
    draw(performance.now());
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
  }, [figure]);

  return <canvas ref={ref} role="img" aria-label={label} style={{ width: "100%", height: "100%", display: "block" }} />;
}
