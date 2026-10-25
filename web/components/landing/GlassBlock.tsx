"use client";

// The hero's glass block: Leash's mark as an object, a clear block holding a smaller solid one, the
// agent inside its limits. The film is drawn into the same WebGL scene on a plane behind the block,
// so the glass refracts the actual footage. If WebGL is unavailable this renders nothing and the
// plain video underneath shows instead.

import { useEffect, useRef } from "react";

export default function GlassBlock({ video, onReady }: { video: React.RefObject<HTMLVideoElement | null>; onReady: (ok: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    const film = video.current;
    if (!el || !film) return;
    let disposed = false;
    let teardown = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js");
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
      const glass = new THREE.Mesh(
        new RoundedBoxGeometry(2, 2, 2, 8, 0.26),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.06, transmission: 1, thickness: 1.6, ior: 1.42, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.8, attenuationColor: new THREE.Color("#dfeee6"), attenuationDistance: 6 }),
      );
      block.add(glass);
      const core = new THREE.Mesh(
        new RoundedBoxGeometry(0.78, 0.78, 0.78, 6, 0.12),
        new THREE.MeshPhysicalMaterial({ color: 0x15201a, metalness: 0.2, roughness: 0.32, clearcoat: 0.6, envMapIntensity: 0.9 }),
      );
      core.position.set(0.38, -0.38, 0.1);
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
        block.scale.setScalar(narrow ? 0.6 : Math.min(0.84, w / 1700 + 0.2));
        baseY = narrow ? 0.95 : 0.78;
        block.position.set(narrow ? 0 : 0.35, baseY, 0);
      };

      const render = (now: number) => {
        frame = 0;
        const t = calm ? 0 : (now - start) / 1000;
        pointer.x += (pointer.tx - pointer.x) * 0.04;
        pointer.y += (pointer.ty - pointer.y) * 0.04;
        block.rotation.set(0.42 + Math.sin(t * 0.35) * 0.06 + pointer.y * 0.12, -0.62 + t * 0.12 + pointer.x * 0.2, 0.06);
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
