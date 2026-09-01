"use client";

import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Html, OrbitControls, useBounds, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import Link from "next/link";
import type { Job } from "@/lib/types";

// ── The loaded model ───────────────────────────────────────────────────────
function Model({ url, wireframe }: { url: string; wireframe: boolean }) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m) (m as THREE.Material & { wireframe?: boolean }).wireframe = wireframe;
        });
      }
    });
  }, [scene, wireframe]);

  return <primitive object={scene} />;
}

// Refits the camera to the model on load and whenever `signal` changes (Reset button).
function Refit({ signal }: { signal: number }) {
  const bounds = useBounds();
  useEffect(() => {
    bounds.refresh().clip().fit();
  }, [signal, bounds]);
  return null;
}

// ── Error boundary — model files can be corrupt or use unsupported features ──
class ModelErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function Viewer({ job, photos }: { job: Job; photos: string[] }) {
  const [wireframe, setWireframe] = useState(false);
  const [ambient, setAmbient] = useState(0.8);
  const [refit, setRefit] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const modelUrl = `/api/jobs/${job.id}/model`;

  return (
    <div className="flex h-screen flex-col md:flex-row">
      {/* Canvas */}
      <div className="relative h-[55vh] bg-[#0e0f13] md:h-screen md:flex-1">
        {/* Floating back + title */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-black/60 px-3 py-1.5 text-sm text-neutral-200 backdrop-blur hover:bg-black/80"
          >
            ← All scans
          </Link>
          <span className="rounded-lg bg-black/40 px-3 py-1.5 text-sm text-neutral-300 backdrop-blur">
            {job.name}
          </span>
        </div>

        {loadFailed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-neutral-300">This model couldn&apos;t be displayed in the browser.</p>
            <a
              href={`/api/jobs/${job.id}/download`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Download the model (.zip)
            </a>
          </div>
        ) : (
          <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]} className="absolute inset-0">
            <ambientLight intensity={ambient} />
            <hemisphereLight intensity={ambient * 0.4} groundColor="#222" />
            <directionalLight position={[5, 8, 5]} intensity={1.1} />
            <directionalLight position={[-5, -3, -5]} intensity={0.4} />
            <Suspense
              fallback={
                <Html center className="text-sm text-neutral-400">
                  Loading model…
                </Html>
              }
            >
              <ModelErrorBoundary onError={() => setLoadFailed(true)}>
                <Bounds fit clip observe margin={1.2}>
                  <Refit signal={refit} />
                  <Model url={modelUrl} wireframe={wireframe} />
                </Bounds>
              </ModelErrorBoundary>
            </Suspense>
            <OrbitControls makeDefault enablePan enableZoom enableRotate />
          </Canvas>
        )}
      </div>

      {/* Side panel: controls + source photos */}
      <aside className="flex-1 overflow-y-auto border-t border-neutral-800 bg-neutral-950/60 p-4 md:h-screen md:w-72 md:flex-none md:border-l md:border-t-0">
        <div className="space-y-4">
          {/* Controls */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRefit((n) => n + 1)}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Reset view
              </button>
              <button
                onClick={() => setWireframe((w) => !w)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  wireframe
                    ? "border-blue-500 bg-blue-500/10 text-blue-300"
                    : "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                }`}
              >
                Wireframe {wireframe ? "on" : "off"}
              </button>
            </div>

            <label className="block text-sm text-neutral-400">
              Lighting
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={ambient}
                onChange={(e) => setAmbient(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>

            <a
              href={`/api/jobs/${job.id}/download`}
              className="block rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-500"
            >
              Download model (.zip)
            </a>
          </div>

          <hr className="border-neutral-800" />

          {/* Source photos for input↔output comparison */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
              Source photos ({photos.length})
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={f}
                  src={`/api/jobs/${job.id}/photos/${f}`}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded object-cover"
                />
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
