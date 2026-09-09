"use client";

import { useState } from "react";
import type { CaptureKind } from "@/lib/types";
import Balance from "@/components/Balance";
import Uploader from "@/components/Uploader";
import VideoUploader from "@/components/VideoUploader";

type Tip = { emoji: string; title: string; body: string };

const PANO_TIPS: Tip[] = [
  { emoji: "📱", title: "Use Panorama / 360 mode", body: "Your phone's pano mode, or a 360 camera. Equirectangular (2:1) images look best." },
  { emoji: "🧍", title: "Stand where you see most", body: "Capture from the middle of the room, or the doorway looking in." },
  { emoji: "🔒", title: "Lock exposure first", body: "Auto-brightness drift creates a visible seam. Lock it before you sweep." },
  { emoji: "💡", title: "Lights on, curtains open", body: "Even light, no harsh shadows — detail is the whole point of a 360." },
  { emoji: "🖼️", title: "One pano per viewpoint", body: "Add several from different spots to build a walkable tour." },
  { emoji: "⚡", title: "No wait", body: "360 tours are ready the instant they upload — no reconstruction." },
];

const SCAN_TIPS: Tip[] = [
  { emoji: "🔄", title: "Orbit the subject", body: "Walk a full circle around it, then a second pass higher or lower." },
  { emoji: "🔗", title: "60–80% overlap", body: "Each photo should share most of its frame with the one before it." },
  { emoji: "🔒", title: "Lock exposure & focus", body: "Tap-and-hold on your phone so brightness doesn't jump between shots." },
  { emoji: "💡", title: "Even, soft light", body: "Avoid hard shadows and moving light. Overcast or indoor diffuse light is ideal." },
  { emoji: "🔢", title: "40–80 photos", body: "20 is the minimum; 40–80 gives a noticeably cleaner model." },
];

const SPLAT_TIPS: Tip[] = [
  { emoji: "🚶", title: "Walk slowly", body: "About one step per second. A steady 60–120s walk beats a fast one." },
  { emoji: "📷", title: "Phone at chest height", body: "Both hands, held steady. Landscape or portrait both fine." },
  { emoji: "🔲", title: "Perimeter, then middle", body: "Follow the walls first, then a second pass across the centre." },
  { emoji: "🚫", title: "Don't spin on the spot", body: "Rotating without moving gives the reconstruction nothing to work with." },
  { emoji: "🔒", title: "Lock exposure", body: "Auto-exposure drift confuses the solver. Lights on, curtains open." },
  { emoji: "⏱️", title: "Under 3 minutes", body: "KIRI caps video at 3 min / 1080p. 60–120s is the sweet spot." },
];

const TABS: { kind: CaptureKind; label: string; sub?: string }[] = [
  { kind: "pano_360", label: "360 tour" },
  { kind: "photo_3d", label: "3D scan", sub: "mesh" },
  { kind: "splat_3dgs", label: "Gaussian splat", sub: "walk-through" },
];

const INTRO: Record<CaptureKind, string> = {
  pano_360:
    "Full-resolution 360 photos, instant and free — the best way to record how a space looks on a date.",
  photo_3d:
    "Reconstruct a walkable 3D mesh from a photo set. Takes 5–40 min and uses one KIRI credit.",
  splat_3dgs:
    "A short walkthrough video → a real 3D capture you can move through, with depth and parallax. Reconstructed by KIRI (Gaussian splatting). 5–40 min, one credit.",
};

const GUIDANCE_TITLE: Record<CaptureKind, string> = {
  pano_360: "Shooting a good 360",
  photo_3d: "Before you shoot",
  splat_3dgs: "Filming a good walkthrough",
};

const TIPS: Record<CaptureKind, Tip[]> = {
  pano_360: PANO_TIPS,
  photo_3d: SCAN_TIPS,
  splat_3dgs: SPLAT_TIPS,
};

export default function CaptureTabs() {
  const [mode, setMode] = useState<CaptureKind>("pano_360");
  const usesCredits = mode !== "pano_360";

  return (
    <div>
      {/* Mode switch — 360 is primary; mesh and splat are the reconstructed upgrades. */}
      <div className="mb-5 inline-flex flex-wrap rounded-xl border border-neutral-800 bg-neutral-900/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setMode(t.kind)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              mode === t.kind ? "bg-blue-600 text-white" : "text-neutral-300 hover:text-white"
            }`}
          >
            {t.label}
            {t.sub && <span className="opacity-70"> · {t.sub}</span>}
          </button>
        ))}
      </div>

      <p className="mb-5 text-sm text-neutral-400">{INTRO[mode]}</p>

      {/* Guidance — first-class, not a help page. It decides quality. */}
      <section className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
            {GUIDANCE_TITLE[mode]}
          </h2>
          {usesCredits && <Balance />}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {TIPS[mode].map((t) => (
            <li key={t.title} className="flex gap-3">
              <span className="text-lg leading-none">{t.emoji}</span>
              <span>
                <span className="block text-sm font-medium text-neutral-100">{t.title}</span>
                <span className="block text-sm text-neutral-400">{t.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Remount on mode change so uploader state resets. */}
      {mode === "splat_3dgs" ? (
        <VideoUploader key="splat" />
      ) : (
        <Uploader key={mode} mode={mode} />
      )}
    </div>
  );
}
