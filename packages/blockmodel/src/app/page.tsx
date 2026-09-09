import CaptureTabs from "@/components/CaptureTabs";
import JobList from "@/components/JobList";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-50">blockmodel</h1>
        <p className="text-sm text-neutral-400">
          Record how a space looks on a date — as a 360 tour, or a 3D scan.
        </p>
      </header>

      {/* New capture */}
      <section className="mb-10">
        <CaptureTabs />
      </section>

      {/* Recent / running */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">
          Your captures
        </h2>
        <JobList />
      </section>
    </main>
  );
}
