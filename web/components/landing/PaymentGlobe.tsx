"use client";

// A sphere of agent payments: tangent chips on a Fibonacci sphere, small at the front and back and
// large at the silhouette, turning slowly. The geometry and depth rule follow PRYDD's photo globe;
// the chips are drawn here on canvas so the sphere reads as money moving under rules.

import { useEffect, useRef } from "react";
import type { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import styles from "./landing.module.css";

const SPHERE_RADIUS = 3.1;
const CHIP_COUNT = 300;
const CHIP_WIDTH = 0.5;
const CHIP_ASPECT = 2.4;
const GROUP_SCALE = 1.15;
const ROTATION_SPEED = 0.05;
const ENTRANCE_STAGGER = 0.6;
const ENTRANCE_DURATION = 0.6;

type Chip = { kind: "paid" | "refused" | "asked" | "approved"; text: string };

// Mostly payments that went through, a few refusals and asks: the mix a healthy leash produces.
const CHIPS: Chip[] = [
  { kind: "paid", text: "$1.00" }, { kind: "paid", text: "$0.25" }, { kind: "paid", text: "$2.00" },
  { kind: "paid", text: "$0.40" }, { kind: "paid", text: "$1.20" }, { kind: "paid", text: "$0.05" },
  { kind: "paid", text: "$3.00" }, { kind: "paid", text: "$0.80" }, { kind: "refused", text: "Refused" },
  { kind: "asked", text: "$5.00?" }, { kind: "approved", text: "$5.00" }, { kind: "refused", text: "Over cap" },
];

const TONES = {
  paid: { dot: "#208550", ink: "#111" },
  refused: { dot: "#c8323f", ink: "#c8323f" },
  asked: { dot: "#d69a1d", ink: "#111" },
  approved: { dot: "#2457f5", ink: "#111" },
} as const;

/** Projected sphere diameter, shared with the hero so the settled sphere can frame a card. */
export function globeProjectionDiameter(width: number, height: number) {
  const worldRadius = SPHERE_RADIUS * GROUP_SCALE;
  const projectionDepth = Math.sqrt(12 ** 2 - worldRadius ** 2);
  const sourceDiameter = (height * worldRadius) / (projectionDepth * Math.tan((38 * Math.PI) / 360));
  return Math.min(sourceDiameter, width * 0.86, height * 0.86);
}

function drawChip(chip: Chip): HTMLCanvasElement {
  const w = 480;
  const h = Math.round(w / CHIP_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const r = h / 2;
  // A soft grey fill rather than white, so chips hold their shape on the white hero as well as the dark one.
  g.fillStyle = "#eef0f3";
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, r - 4);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 4;
  g.stroke();
  const tone = TONES[chip.kind];
  g.fillStyle = tone.dot;
  g.beginPath();
  g.arc(r + 2, h / 2, h * 0.17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = tone.ink;
  g.font = `600 ${Math.round(h * 0.4)}px Inter, Arial, sans-serif`;
  g.textBaseline = "middle";
  g.fillText(chip.text, r + h * 0.4, h / 2 + 2);
  return canvas;
}

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export default function PaymentGlobe({ still = false }: { still?: boolean }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let teardown = () => {};

    (async () => {
      const THREE = await import("three");
      await document.fonts?.ready;
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      } catch {
        el.dataset.state = "unavailable";
        return;
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = styles.globeCanvas;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 0, 12);
      const group = new THREE.Group();
      group.scale.setScalar(GROUP_SCALE);
      scene.add(group);

      const geometry = new THREE.PlaneGeometry(1, 1 / CHIP_ASPECT);
      const textures: CanvasTexture[] = [];
      const materials: MeshBasicMaterial[] = CHIPS.map((chip) => {
        const texture = new THREE.CanvasTexture(drawChip(chip));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
        textures.push(texture);
        return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, toneMapped: false });
      });

      const chips: { mesh: Mesh<PlaneGeometry, MeshBasicMaterial>; position: InstanceType<typeof THREE.Vector3>; normal: InstanceType<typeof THREE.Vector3>; size: number; delay: number }[] = [];
      const random = seeded(311);
      const golden = Math.PI * (3 - Math.sqrt(5));
      const origin = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const orientation = new THREE.Matrix4();
      for (let i = 0; i < CHIP_COUNT; i++) {
        const y = 1 - (i / (CHIP_COUNT - 1)) * 2;
        const ring = Math.sqrt(1 - y * y);
        const angle = golden * i;
        const position = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring).multiplyScalar(SPHERE_RADIUS);
        const normal = position.clone().normalize();
        const mesh = new THREE.Mesh(geometry, materials[Math.floor(random() * materials.length)]);
        orientation.lookAt(origin, normal, up);
        mesh.quaternion.setFromRotationMatrix(orientation);
        mesh.position.copy(position);
        group.add(mesh);
        chips.push({ mesh, position, normal, size: CHIP_WIDTH * (random() < 0.7 ? 1 : 0.72), delay: 0 });
      }

      const world = new THREE.Vector3();
      let frame = 0;
      let last: number | null = null;
      let elapsed = 0;
      let entranceAt: number | null = null;
      let visible = false;

      const live = () => !disposed && visible && document.visibilityState === "visible";
      const stop = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        last = null;
      };
      const schedule = () => {
        if (!live()) return stop();
        if (!frame) frame = requestAnimationFrame(render);
      };

      function render(time: number) {
        frame = 0;
        if (!live()) return stop();
        const delta = last === null ? 0 : Math.min((time - last) / 1000, 0.05);
        last = time;
        if (!still) elapsed += delta;
        group.rotation.set(0.2, -0.85 + elapsed * ROTATION_SPEED, 0.05);
        group.updateMatrixWorld(true);

        if (entranceAt === null) {
          entranceAt = elapsed;
          // Chips nearest the camera land first, so the sphere assembles from the front.
          chips
            .map((chip) => ({ chip, z: world.copy(chip.position).applyMatrix4(group.matrixWorld).z }))
            .sort((a, b) => b.z - a.z)
            .forEach(({ chip }, i) => (chip.delay = (i / chips.length) * ENTRANCE_STAGGER));
        }
        const age = still ? Infinity : elapsed - entranceAt;

        for (const chip of chips) {
          world.copy(chip.position).applyMatrix4(group.matrixWorld);
          // Small at the front and back, large at the rim: a quiet centre for the headline without
          // cutting a hole in the sphere.
          const depth = 0.12 + 1.3 * Math.exp(-((world.z / 1.5) ** 2));
          const t = Math.max(0, Math.min(1, (age - chip.delay) / ENTRANCE_DURATION));
          const lift = 0.25 * (1 - t) ** 3;
          chip.mesh.position.copy(chip.position).addScaledVector(chip.normal, lift);
          chip.mesh.scale.setScalar(chip.size * depth * (0.6 + 0.4 * t));
        }
        renderer.render(scene, camera);
        el!.dataset.state = "ready";
        if (!still) schedule();
      }

      function resize() {
        const width = el!.clientWidth;
        const height = el!.clientHeight;
        if (!width || !height) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        const diameter = globeProjectionDiameter(width, height);
        const worldRadius = SPHERE_RADIUS * GROUP_SCALE;
        const depth = Math.sqrt(camera.position.z ** 2 - worldRadius ** 2);
        camera.fov = (2 * Math.atan((height * worldRadius) / (diameter * depth)) * 180) / Math.PI;
        camera.updateProjectionMatrix();
        last = null;
        if (still) {
          visible = true;
          render(performance.now());
        } else schedule();
      }

      const seen = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        schedule();
      });
      const sized = new ResizeObserver(resize);
      seen.observe(el);
      sized.observe(el);
      document.addEventListener("visibilitychange", schedule);
      resize();

      teardown = () => {
        stop();
        seen.disconnect();
        sized.disconnect();
        document.removeEventListener("visibilitychange", schedule);
        materials.forEach((m) => m.dispose());
        textures.forEach((t) => t.dispose());
        geometry.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => {
      if (!disposed) el.dataset.state = "unavailable";
    });

    return () => {
      disposed = true;
      teardown();
    };
  }, [still]);

  return <div ref={host} className={styles.globe} data-state="loading" aria-hidden="true" />;
}
