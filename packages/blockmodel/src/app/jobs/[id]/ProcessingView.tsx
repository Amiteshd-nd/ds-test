"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { stageLabel } from "@/lib/types";

const STAGES: { key: Job["status"]; label: string }[] = [
  { key: "uploading", label: "Uploading" },
  { key: "queued", label: "In queue" },
  { key: "processing", label: "Reconstructing" },
  { key: "succeeded", label: "Done" },
];

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export default function ProcessingView({
  job,
  noViewableModel,
}: {
  job: Job;
  noViewableModel: boolean;
}) {
  // Local ticking clock for elapsed time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = job.startedAt ?? job.createdAt;
  const elapsed = now - start;
  const stage = stageLabel(job.status);
  const currentIndex = STAGES.findIndex((s) => s.key === job.status);

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← All scans
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-neutral-50">{job.name}</h1>
      <p className="text-sm text-neutral-500">{job.photoCount} photos</p>

      {noViewableModel ? (
        <div className="mt-8 rounded-xl border border-amber-700/50 bg-amber-500/10 p-5">
          <p className="text-amber-200">
            KIRI finished, but the result didn&apos;t include a viewable mesh (.glb). You can still
            download the raw output.
          </p>
          <a
            href={`/api/jobs/${job.id}/download`}
            className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-black"
          >
            Download raw output (.zip)
          </a>
        </div>
      ) : (
        <>
          {/* Stage stepper */}
          <ol className="mt-8 space-y-3">
            {STAGES.map((s, i) => {
              const done = currentIndex > i;
              const active = currentIndex === i;
              return (
                <li key={s.key} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      done
                        ? "bg-emerald-500 text-black"
                        : active
                          ? "bg-blue-500 text-white"
                          : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={active ? "text-neutral-100" : done ? "text-neutral-400" : "text-neutral-600"}>
                    {s.label}
                    {active && <span className="ml-2 inline-block animate-pulse text-blue-400">●</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Live status card */}
          <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
            <p className="text-neutral-100">{stage.title}</p>
            <p className="mt-1 text-sm text-neutral-400">{stage.detail}</p>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tabular-nums text-neutral-50">
                {fmtElapsed(elapsed)}
              </span>
              <span className="text-sm text-neutral-500">usually 5–40 min</span>
            </div>
          </div>

          {/* Reassurance about leaving */}
          <p className="mt-6 rounded-lg bg-neutral-900/60 px-4 py-3 text-sm text-neutral-400">
            You can close this tab — the scan keeps running on KIRI&apos;s servers. It&apos;ll show up
            under <Link href="/" className="text-blue-400 underline">your scans</Link>, and if you
            allowed notifications we&apos;ll ping you when it&apos;s done.
          </p>
        </>
      )}
    </main>
  );
}
