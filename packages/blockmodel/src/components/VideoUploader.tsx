"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Splat capture: one walkthrough video → KIRI 3DGS. Video (not photos) because a
// 90-second walk supplies the many overlapping viewpoints a splat needs, and it's
// the mode a non-technical person captures well on the first try.
export default function VideoUploader() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [video, setVideo] = useState<{ file: File; url: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File) => {
    if (!f.type.startsWith("video/")) {
      setError("Please choose a video file.");
      return;
    }
    if (video) URL.revokeObjectURL(video.url);
    setError(null);
    setVideo({ file: f, url: URL.createObjectURL(f) });
  };

  const clear = () => {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
    setError(null);
  };

  const submit = async () => {
    if (!video || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("kind", "splat_3dgs");
      form.append("source", "video");
      form.append("photos", video.file, video.file.name);
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      // Reconstruction takes minutes — offer to notify on completion.
      if ("Notification" in window && Notification.permission === "default") {
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
      <div>
        <label className="mb-1 block text-sm text-neutral-400">Capture name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Flat 3B — living room"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
      </div>

      {!video ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) pick(e.dataTransfer.files[0]);
          }}
          className="cursor-pointer rounded-xl border-2 border-dashed border-neutral-700 p-8 text-center transition hover:border-neutral-500"
        >
          <p className="text-neutral-200">Tap to choose a walkthrough video, or drag &amp; drop</p>
          <p className="mt-1 text-sm text-neutral-500">
            On your phone this opens the camera — record a 60–120s walk. Max 3 min, 1080p.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) pick(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={video.url} controls muted playsInline className="max-h-80 w-full" />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="truncate text-neutral-200">{video.file.name}</span>
            <span className="text-neutral-400">{formatBytes(video.file.size)}</span>
            <button onClick={clear} className="ml-auto text-neutral-500 underline hover:text-neutral-300">
              Choose another
            </button>
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <button
        onClick={submit}
        disabled={!video || submitting}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition enabled:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Uploading…" : !video ? "Add a video" : "Create splat (≈ 1 credit · 5–40 min)"}
      </button>
    </div>
  );
}
