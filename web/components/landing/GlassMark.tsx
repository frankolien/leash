"use client";

// The hero's glass mark: Leash's tether as an object, a clear ring (the limit) with a dark bead
// (the agent) drifting inside it and never reaching the edge. The film is drawn into the same WebGL scene on a plane behind the block,
// so the glass refracts the actual footage. If WebGL is unavailable this renders nothing and the
// plain video underneath shows instead.

import { useEffect, useRef } from "react";

export default function GlassMark({ video, onReady }: { video: React.RefObject<HTMLVideoElement | null>; onReady: (ok: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    const film = video.current;
    if (!el || !film) return;
    let disposed = false;
    let teardown = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      } catch {
        onReady(false);
        return;
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envMap;

      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 0, 10);

      // The film, on a plane far enough back to read as the world behind the glass.
      const filmTexture = new THREE.VideoTexture(film);
      filmTexture.colorSpace = THREE.SRGBColorSpace;
      const filmMaterial = new THREE.MeshBasicMaterial({ map: filmTexture, toneMapped: false });
      const filmPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), filmMaterial);
      filmPlane.position.z = -6;
      scene.add(filmPlane);

      const block = new THREE.Group();
      scene.add(block);
      const RING = 1.15;
      const TUBE = 0.34;
      const BEAD = 0.36;
      // How far the bead may wander from the centre and still clear the ring's inner edge.
      const FREE = RING - TUBE - BEAD - 0.06;
      const glass = new THREE.Mesh(
        new THREE.TorusGeometry(RING, TUBE, 48, 160),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1, thickness: 1.2, ior: 1.45, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9, attenuationColor: new THREE.Color("#e3f0e8"), attenuationDistance: 5 }),
      );
      block.add(glass);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(BEAD, 48, 32),
        new THREE.MeshPhysicalMaterial({ color: 0x15201a, metalness: 0.25, roughness: 0.28, clearcoat: 0.7, envMapIntensity: 0.9 }),
      );
      block.add(core);

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      let baseY = 0;
      const onPointer = (e: PointerEvent) => {
        pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let frame = 0;
      let visible = true;
      const start = performance.now();

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Cover the view at the plane's depth with the film's own aspect, like object-fit: cover.
        const depth = camera.position.z - filmPlane.position.z;
        const viewH = 2 * depth * Math.tan((camera.fov * Math.PI) / 360);
        const viewW = viewH * camera.aspect;
        const filmAspect = film.videoWidth && film.videoHeight ? film.videoWidth / film.videoHeight : 16 / 9;
        const scale = Math.max(viewW, viewH * filmAspect) * 1.04;
        filmPlane.scale.set(scale, scale / filmAspect, 1);
        // Smaller and higher on a phone so the caption keeps the lower half.
        const narrow = w < 700;
        block.scale.setScalar(narrow ? 0.66 : Math.min(0.95, w / 1600 + 0.25));
        baseY = narrow ? 0.95 : 0.78;
        block.position.set(narrow ? 0 : 0.35, baseY, 0);
      };

      const render = (now: number) => {
        frame = 0;
        const t = calm ? 0 : (now - start) / 1000;
        pointer.x += (pointer.tx - pointer.x) * 0.04;
        pointer.y += (pointer.ty - pointer.y) * 0.04;
        // Mostly facing the viewer so it reads as the mark, with a slow sway that shows its depth.
        block.rotation.set(0.32 + Math.sin(t * 0.3) * 0.16 + pointer.y * 0.18, -0.38 + Math.sin(t * 0.22) * 0.3 + pointer.x * 0.25, Math.sin(t * 0.17) * 0.08);
        const r = FREE * (0.55 + 0.45 * Math.sin(t * 0.41));
        core.position.set(Math.cos(t * 0.53) * r, Math.sin(t * 0.71) * r, 0);
        block.position.y = baseY + Math.sin(t * 0.8) * 0.06;
        renderer.render(scene, camera);
        if (visible && !disposed) frame = requestAnimationFrame(render);
      };

      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !frame) frame = requestAnimationFrame(render);
      });
      const ro = new ResizeObserver(resize);
      io.observe(el);
      ro.observe(el);
      film.addEventListener("loadedmetadata", resize);
      resize();
      frame = requestAnimationFrame(render);
      onReady(true);

      teardown = () => {
        cancelAnimationFrame(frame);
        io.disconnect();
        ro.disconnect();
        film.removeEventListener("loadedmetadata", resize);
        window.removeEventListener("pointermove", onPointer);
        scene.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as InstanceType<typeof THREE.Material>).dispose();
          }
        });
        filmTexture.dispose();
        envMap.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => {
      if (!disposed) onReady(false);
    });

    return () => {
      disposed = true;
      teardown();
    };
  }, [video, onReady]);

  return <div ref={host} aria-hidden="true" style={{ position: "absolute", inset: 0 }} />;
}
