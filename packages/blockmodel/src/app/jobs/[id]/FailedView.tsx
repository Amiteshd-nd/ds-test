"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Job } from "@/lib/types";

// Map KIRI's error codes / our internal codes to a plain cause + fix.
function explain(job: Job): { cause: string; fixes: string[] } {
  const code = job.errorCode ?? "";
  if (code === "403") {
    return {
      cause: "Your KIRI account is out of credits, so the scan couldn't run.",
      fixes: ["Top up credits in your KIRI dashboard, then start the scan again."],
    };
  }
  if (code === "401" || code === "no_api_key") {
    return {
      cause: "KIRI rejected the API key.",
      fixes: ["Check KIRI_API_KEY in blockmodel/.env.local and restart the dev server."],
    };
  }
  if (code === "2007") {
    return {
      cause: "Too few photos reached KIRI.",
      fixes: ["Shoot 40–80 photos and try again."],
    };
  }
  // Default: reconstruction failure — the common, expected case.
  return {
    cause:
      job.errorMsg ??
      "KIRI couldn't build a model from these photos. This is normal and usually about the capture, not the subject.",
    fixes: [
      "More overlap — each shot should share 60–80% with the last.",
      "More angles — orbit fully, then do a second pass at a different height.",
      "Sharper, evenly-lit photos — lock focus/exposure, avoid motion blur.",
      "Avoid shiny, transparent, or featureless surfaces (glass, chrome, blank walls).",
    ],
  };
}

export default function FailedView({ job, photos }: { job: Job; photos: string[] }) {
  const { cause, fixes } = explain(job);
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Resubmit using the source files already stored server-side — no re-upload.
  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Retry failed.");
      router.refresh();
      window.location.reload(); // JobView re-polls and shows the new attempt
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed.");
      setRetrying(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← All scans
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          ✕
        </span>
        <div>
          <h1 className="text-xl font-semibold text-neutral-50">Scan failed</h1>
          <p className="text-sm text-neutral-500">{job.name}</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-red-800/40 bg-red-500/5 p-5">
        <p className="text-sm font-medium text-neutral-300">What happened</p>
        <p className="mt-1 text-neutral-100">{cause}</p>
        {job.errorCode && (
          <p className="mt-2 text-xs text-neutral-500">Reference: {job.errorCode}</p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <p className="text-sm font-medium text-neutral-300">What to try next</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
          {fixes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      {/* Show the photos they sent — useful for spotting the problem. */}
      {photos.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm text-neutral-400">The {photos.length} photos you sent:</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {photos.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f}
                src={`/api/jobs/${job.id}/photos/${f}`}
                alt=""
                className="aspect-square w-full rounded-md object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {retryError && (
        <p className="mt-6 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{retryError}</p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {job.kind !== "pano_360" && (
          <button
            onClick={retry}
            disabled={retrying}
            className="rounded-lg bg-blue-600 px-4 py-3 font-medium text-white enabled:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {retrying ? "Resubmitting…" : "Try again (≈ 1 credit, no re-upload)"}
          </button>
        )}
        <Link
          href="/"
          className="inline-block rounded-lg border border-neutral-700 px-4 py-3 font-medium text-neutral-200 hover:bg-neutral-800"
        >
          Start a new capture
        </Link>
        {job.attempts > 1 && (
          <span className="text-sm text-neutral-500">Attempt {job.attempts}</span>
        )}
      </div>
    </main>
  );
}
