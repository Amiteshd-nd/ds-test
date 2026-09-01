"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { isTerminal } from "@/lib/types";
import ProcessingView from "./ProcessingView";
import FailedView from "./FailedView";

// three.js must not render on the server.
const Viewer = dynamic(() => import("@/components/Viewer"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-[#0e0f13]" />,
});

interface JobResponse {
  job: Job;
  photos: string[];
  hasModel: boolean;
}

const POLL_MS = 10000;

export default function JobView({ id }: { id: string }) {
  const [data, setData] = useState<JobResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const prevStatus = useRef<Job["status"] | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (res.status === 404) {
          if (alive) setNotFound(true);
          return;
        }
        const json: JobResponse = await res.json();
        if (!alive) return;
        setData(json);
        handleStatusChange(json.job);
        if (!isTerminal(json.job.status)) {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch {
        if (alive) timer = setTimeout(poll, POLL_MS);
      }
    };

    const handleStatusChange = (job: Job) => {
      const prev = prevStatus.current;
      // Ask for notification permission the moment reconstruction actually begins.
      if (
        job.status === "processing" &&
        prev !== "processing" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission().catch(() => {});
      }
      // Fire a notification when we cross into a terminal state.
      if (prev && !isTerminal(prev) && isTerminal(job.status)) {
        if ("Notification" in window && Notification.permission === "granted") {
          const ok = job.status === "succeeded";
          new Notification(ok ? "Scan complete ✅" : "Scan failed ❌", {
            body: ok ? `"${job.name}" is ready to view.` : `"${job.name}" couldn't be reconstructed.`,
          });
        }
      }
      prevStatus.current = job.status;
    };

    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-neutral-300">That scan doesn&apos;t exist.</p>
        <Link href="/" className="mt-4 inline-block text-blue-400 underline">
          ← Back to home
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-neutral-500">Loading scan…</main>
    );
  }

  const { job, photos } = data;

  if (job.status === "failed") return <FailedView job={job} photos={photos} />;
  if (job.status === "succeeded" && data.hasModel) return <Viewer job={job} photos={photos} />;

  // Uploading / queued / processing — or succeeded-but-no-viewable-mesh.
  return <ProcessingView job={job} noViewableModel={job.status === "succeeded" && !data.hasModel} />;
}
