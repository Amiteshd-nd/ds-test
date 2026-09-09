"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";

// Gaussian-splat viewer using @mkkellogg/gaussian-splats-3d's standalone Viewer,
// which brings its own renderer + orbit controls. The library and three are only
// pulled in here (client-only, lazy) so they never touch the main bundle.
export default function SplatViewer({ job }: { job: Job; photos: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let viewer: any = null;
    let disposed = false;

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const GS: any = await import("@mkkellogg/gaussian-splats-3d");
        if (disposed || !containerRef.current) return;

        viewer = new GS.Viewer({
          rootElement: containerRef.current,
          selfDrivenMode: true, // run its own render loop
          useBuiltInControls: true, // orbit / pan / zoom
          // Avoid the SharedArrayBuffer path, which needs COOP/COEP headers we don't set.
          sharedMemoryForWorkers: false,
        });

        // Our model URL has no file extension, so tell the loader the format
        // explicitly (derived from the stored file: .ply / .splat / .ksplat).
        const ext = (job.modelPath ?? "").split(".").pop()?.toLowerCase();
        const format =
          ext === "ply"
            ? GS.SceneFormat.Ply
            : ext === "ksplat"
              ? GS.SceneFormat.KSplat
              : GS.SceneFormat.Splat;

        await viewer.addSplatScene(`/api/jobs/${job.id}/model`, {
          showLoadingUI: true,
          splatAlphaRemovalThreshold: 5,
          format,
        });
        if (disposed) return;
        viewer.start();
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "Failed to load the splat.");
      }
    })();

    return () => {
      disposed = true;
      try {
        viewer?.dispose?.();
      } catch {
        /* already torn down */
      }
    };
  }, [job.id]);

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
          {job.name} · gaussian splat
        </span>
      </div>

      <a
        href={`/api/jobs/${job.id}/download`}
        className="absolute right-3 top-3 z-10 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-neutral-100 backdrop-blur hover:bg-black/80"
      >
        Download
      </a>

      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-neutral-300">This splat couldn&apos;t be rendered in the browser.</p>
          <p className="max-w-md text-sm text-neutral-500">{error}</p>
          <a
            href={`/api/jobs/${job.id}/download`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Download the splat (.zip)
          </a>
        </div>
      ) : (
        <div ref={containerRef} className="absolute inset-0" />
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-xs text-neutral-300 backdrop-blur">
        Drag to orbit · scroll to zoom · this is a real 3D capture — move through it
      </div>
    </div>
  );
}
