import Balance from "@/components/Balance";
import JobList from "@/components/JobList";
import Uploader from "@/components/Uploader";

const TIPS: { emoji: string; title: string; body: string }[] = [
  { emoji: "🔄", title: "Orbit the subject", body: "Walk a full circle around it, then a second pass higher or lower." },
  { emoji: "🔗", title: "60–80% overlap", body: "Each photo should share most of its frame with the one before it." },
  { emoji: "🔒", title: "Lock exposure & focus", body: "Tap-and-hold on your phone so brightness doesn't jump between shots." },
  { emoji: "💡", title: "Even, soft light", body: "Avoid hard shadows and moving light. Overcast or indoor diffuse light is ideal." },
  { emoji: "🔢", title: "40–80 photos", body: "20 is the minimum; 40–80 gives a noticeably cleaner model." },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">blockmodel</h1>
          <p className="text-sm text-neutral-400">Turn phone photos into a 3D model.</p>
        </div>
        <Balance />
      </header>

      {/* Capture guidance — first-class, not a help page. It decides quality. */}
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">
          Before you shoot
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {TIPS.map((t) => (
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

      {/* Upload */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">New scan</h2>
        <Uploader />
      </section>

      {/* Recent / running */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">Your scans</h2>
        <JobList />
      </section>
    </main>
  );
}
