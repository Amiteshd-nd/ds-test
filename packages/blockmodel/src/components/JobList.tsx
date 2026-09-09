"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { kindLabel, stageLabel } from "@/lib/types";

const STATUS_DOT: Record<Job["status"], string> = {
  uploading: "bg-sky-400",
  queued: "bg-sky-400",
  processing: "bg-blue-400 animate-pulse",
  succeeded: "bg-emerald-400",
  failed: "bg-red-400",
};

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// "Running / recent scans" — lets you close a tab and come back to a job.
export default function JobList() {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/jobs")
        .then((r) => r.json())
        .then((j) => alive && setJobs(j.jobs))
        .catch(() => {});
    load();
    // Refresh periodically so in-flight jobs update their dots.
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const archive = async (e: React.MouseEvent, id: string) => {
    // The row is a link — don't navigate when archiving.
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => {});
    setJobs((prev) => prev?.filter((j) => j.id !== id) ?? prev);
  };

  if (jobs === null) return <p className="text-sm text-neutral-500">Loading captures…</p>;
  if (jobs.length === 0) return <p className="text-sm text-neutral-500">No captures yet.</p>;

  return (
    <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-900">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[job.status]}`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-neutral-100">{job.name}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    job.kind === "pano_360"
                      ? "bg-blue-500/15 text-blue-300"
                      : "bg-purple-500/15 text-purple-300"
                  }`}
                >
                  {kindLabel(job.kind)}
                </span>
              </span>
              <span className="block text-xs text-neutral-500">
                {job.kind === "pano_360" ? "Ready" : stageLabel(job.status).title} ·{" "}
                {job.photoCount} {job.kind === "pano_360" ? "pano" : "photo"}
                {job.photoCount === 1 ? "" : "s"} · {timeAgo(job.createdAt)}
              </span>
            </span>
            <button
              onClick={(e) => archive(e, job.id)}
              title="Archive (kept on disk, hidden from this list)"
              aria-label="Archive capture"
              className="rounded px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300"
            >
              ✕
            </button>
            <span className="text-neutral-600">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
