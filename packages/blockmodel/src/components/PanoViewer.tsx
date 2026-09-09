"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import Link from "next/link";
import type { Job } from "@/lib/types";

// The panorama mapped onto the inside of a sphere. We render the sphere's inner
// faces (BackSide) so the camera at the centre sees the image, and flip the
// texture horizontally so it reads the right way round rather than mirrored.
function PanoSphere({ url }: { url: string }) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = -1;
  return (
    <mesh>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

// Camera sits at the centre and only rotates (look around) — not OrbitControls,
// which would move the camera off-centre. Drag works for mouse and touch via
// pointer events. FOV (zoom) is driven from the toolbar for reliable mobile use.
function PanoControls({ fov }: { fov: number }) {
  const { camera, gl } = useThree();
  const lon = useRef(0);
  const lat = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => (drag.current = { x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      lon.current -= (e.clientX - drag.current.x) * 0.15;
      lat.current += (e.clientY - drag.current.y) * 0.15;
      lat.current = Math.max(-85, Math.min(85, lat.current));
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag.current = null);
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);

  useFrame(() => {
    const phi = THREE.MathUtils.degToRad(90 - lat.current);
    const theta = THREE.MathUtils.degToRad(lon.current);
    camera.lookAt(
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      ),
    );
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

export default function PanoViewer({ job, photos }: { job: Job; photos: string[] }) {
  const [index, setIndex] = useState(0);
  const [fov, setFov] = useState(75);

  const panos = photos.length ? photos : [];
  const current = panos[index];
  const url = current ? `/api/jobs/${job.id}/photos/${current}` : null;

  return (
    <div className="fixed inset-0 bg-black">
      {/* Top bar */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-black/60 px-3 py-1.5 text-sm text-neutral-200 backdrop-blur hover:bg-black/80"
        >
          ← All captures
        </Link>
        <span className="rounded-lg bg-black/40 px-3 py-1.5 text-sm text-neutral-300 backdrop-blur">
          {job.name} · 360 tour {panos.length > 1 ? `(${index + 1}/${panos.length})` : ""}
        </span>
      </div>

      {/* Zoom + download */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <button
          onClick={() => setFov((f) => Math.min(90, f + 8))}
          className="h-9 w-9 rounded-lg bg-black/60 text-lg text-neutral-100 backdrop-blur hover:bg-black/80"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => setFov((f) => Math.max(30, f - 8))}
          className="h-9 w-9 rounded-lg bg-black/60 text-lg text-neutral-100 backdrop-blur hover:bg-black/80"
          aria-label="Zoom in"
        >
          +
        </button>
        {url && (
          <a
            href={url}
            download
            className="rounded-lg bg-black/60 px-3 py-1.5 text-sm text-neutral-100 backdrop-blur hover:bg-black/80"
          >
            Download
          </a>
        )}
      </div>

      {url ? (
        <Canvas camera={{ position: [0, 0, 0.1], fov }} className="absolute inset-0">
          <Suspense fallback={null}>
            {/* key forces a fresh texture load when switching panos */}
            <PanoSphere key={url} url={url} />
          </Suspense>
          <PanoControls fov={fov} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-neutral-400">
          No panorama in this tour.
        </div>
      )}

      {/* Drag hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-xs text-neutral-300 backdrop-blur">
        Drag to look around · use +/− to zoom
      </div>

      {/* Pano switcher */}
      {panos.length > 1 && (
        <div className="absolute bottom-16 left-1/2 flex max-w-[92vw] -translate-x-1/2 gap-2 overflow-x-auto rounded-xl bg-black/50 p-2 backdrop-blur">
          {panos.map((f, i) => (
            <button
              key={f}
              onClick={() => setIndex(i)}
              className={`h-12 w-20 shrink-0 overflow-hidden rounded-md border-2 ${
                i === index ? "border-blue-500" : "border-transparent opacity-70"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/jobs/${job.id}/photos/${f}`}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
