"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { stageLabel } from "@/lib/types";

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

  if (jobs === null) return <p className="text-sm text-neutral-500">Loading scans…</p>;
  if (jobs.length === 0) return <p className="text-sm text-neutral-500">No scans yet.</p>;

  return (
    <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-900">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[job.status]}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-neutral-100">{job.name}</span>
              <span className="block text-xs text-neutral-500">
                {stageLabel(job.status).title} · {job.photoCount} photos · {timeAgo(job.createdAt)}
              </span>
            </span>
            <span className="text-neutral-600">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
