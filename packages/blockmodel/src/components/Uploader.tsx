"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BLUR_THRESHOLD, laplacianVariance } from "@/lib/blur";
import type { CaptureKind } from "@/lib/types";

interface Photo {
  id: string;
  file: File;
  url: string;
  blurVariance: number | null; // null = not checked / unknown
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

let photoSeq = 0;

export default function Uploader({ mode = "photo_3d" }: { mode?: CaptureKind }) {
  const router = useRouter();
  const isPano = mode === "pano_360";
  const noun = isPano ? "panorama" : "photo";
  const min = isPano ? 1 : 20;

  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount to avoid leaks.
  useEffect(() => {
    return () => photos.forEach((p) => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setError(null);
      const incoming = Array.from(fileList);
      const images = incoming.filter((f) => f.type.startsWith("image/"));
      const rejected = incoming.length - images.length;
      if (rejected > 0) {
        setError(`${rejected} non-image file${rejected > 1 ? "s" : ""} skipped.`);
      }
      const added: Photo[] = images.map((file) => ({
        id: `p${photoSeq++}`,
        file,
        url: URL.createObjectURL(file),
        blurVariance: null,
      }));
      setPhotos((prev) => [...prev, ...added]);

      // Blur scoring only matters for 3D reconstruction, not for 360 panos.
      if (isPano) return;
      setChecking(true);
      Promise.all(
        added.map(async (p) => ({ id: p.id, v: await laplacianVariance(p.file) })),
      ).then((results) => {
        setPhotos((prev) =>
          prev.map((p) => {
            const r = results.find((x) => x.id === p.id);
            return r ? { ...p, blurVariance: r.v } : p;
          }),
        );
        setChecking(false);
      });
    },
    [isPano],
  );

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearAll = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setError(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const totalBytes = photos.reduce((s, p) => s + p.file.size, 0);
  const blurryCount = photos.filter(
    (p) => p.blurVariance !== null && p.blurVariance < BLUR_THRESHOLD,
  ).length;

  const count = photos.length;
  const tooFew = count > 0 && count < min;
  const lowForQuality = !isPano && count >= 20 && count < 40;
  const canSubmit = count >= min && (isPano || count <= 300) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("kind", mode);
      photos.forEach((p) => form.append("photos", p.file, p.file.name));
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      // 3D scans take minutes — offer to notify. 360 tours are instant.
      if (!isPano && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      router.push(`/jobs/${json.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className="mb-1 block text-sm text-neutral-400">
          {isPano ? "Tour name" : "Scan name"}
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isPano ? "e.g. Flat 3B — move-in" : "e.g. Garden gnome"}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-blue-500 bg-blue-500/5" : "border-neutral-700 hover:border-neutral-500"
        }`}
      >
        <p className="text-neutral-200">
          Tap to choose {isPano ? "360 photos" : "photos"}, or drag &amp; drop here
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {isPano
            ? "Equirectangular (2:1) panoramas work best. Add one per viewpoint to build a tour."
            : "On your phone this opens the camera roll — select 40–80 shots."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same files
          }}
        />
      </div>

      {/* Counts + validation */}
      {count > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-neutral-200">
              <strong>{count}</strong> {noun}
              {count === 1 ? "" : "s"}
            </span>
            <span className="text-neutral-400">{formatBytes(totalBytes)} total</span>
            {!isPano && checking ? (
              <span className="text-neutral-500">checking sharpness…</span>
            ) : !isPano && blurryCount > 0 ? (
              <span className="text-amber-400">{blurryCount} possibly blurry</span>
            ) : null}
            <button onClick={clearAll} className="ml-auto text-neutral-500 underline hover:text-neutral-300">
              Clear all
            </button>
          </div>

          {tooFew && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              Need at least <strong>{min} {noun}{min === 1 ? "" : "s"}</strong>
              {isPano ? "." : ` to start a scan. Add ${min - count} more.`}
            </p>
          )}
          {lowForQuality && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              {count} photos will work, but <strong>40–80</strong> gives a much better model.
            </p>
          )}
        </div>
      )}

      {/* Thumbnails */}
      {count > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
          {photos.map((p) => {
            const blurry = !isPano && p.blurVariance !== null && p.blurVariance < BLUR_THRESHOLD;
            return (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                {blurry && (
                  <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1 text-[10px] font-medium text-black">
                    blurry?
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(p.id);
                  }}
                  className="absolute right-1 top-1 hidden rounded bg-black/70 px-1.5 text-xs text-white group-hover:block"
                  aria-label={`Remove ${noun}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* Submit */}
      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition enabled:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting
          ? isPano
            ? "Creating…"
            : "Uploading…"
          : count < min
            ? `Add ${isPano ? "a panorama" : "at least 20 photos"}`
            : isPano
              ? `Create 360 tour (${count})`
              : `Start scan (${count} photos ≈ 1 credit)`}
      </button>
    </div>
  );
}
