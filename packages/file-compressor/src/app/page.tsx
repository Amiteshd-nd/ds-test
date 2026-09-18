"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompressOptions, Inventory, ModeId, ProgressEvent } from "@/core/types";
import { MODES, defaultOptions } from "@/core/modes";
import { CompressorClient, CompressorError } from "@/worker/client";
import type { SerialisedOutcome, WhichFile } from "@/worker/protocol";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { ComparisonViewer } from "@/components/ComparisonViewer";
import { DropZone } from "@/components/DropZone";
import { GateDialog } from "@/components/GateDialog";
import { ProgressPanel } from "@/components/ProgressPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { Card } from "@/components/ui/primitives";

type Phase = "idle" | "analysing" | "ready" | "compressing" | "gate" | "done";

export default function Home() {
  const client = useRef<CompressorClient | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [options, setOptions] = useState<CompressOptions>(defaultOptions("balanced"));
  const [outcome, setOutcome] = useState<SerialisedOutcome | null>(null);
  const [chosen, setChosen] = useState<"primary" | "alternative">("primary");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState<WhichFile | null>(null);
  const jobId = useRef(0);

  useEffect(() => {
    client.current = new CompressorClient();
    return () => client.current?.terminate();
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setFile(null);
    setBytes(null);
    setInventory(null);
    setOutcome(null);
    setProgress(null);
    setError(null);
    setComparing(null);
    setChosen("primary");
  }, []);

  const accept = useCallback(async (next: File) => {
    setError(null);
    setFile(next);
    setPhase("analysing");
    try {
      const buffer = await next.arrayBuffer();
      setBytes(buffer);
      const result = await client.current!.analyse(buffer);
      setInventory(result);
      // The recommendation comes from the file, so it is also the default.
      setOptions(defaultOptions(result.recommended));
      setPhase("ready");
    } catch (cause) {
      setError(describe(cause));
      setPhase("idle");
    }
  }, []);

  const compress = useCallback(
    async (override?: ModeId) => {
      if (!bytes) return;
      const nextOptions = override ? { ...options, mode: override } : options;
      setOptions(nextOptions);
      setPhase("compressing");
      setProgress(null);
      setError(null);
      jobId.current += 1;
      const id = `job-${jobId.current}`;
      try {
        const result = await client.current!.compress(id, bytes, nextOptions, setProgress);
        setOutcome(result);
        setChosen("primary");
        setPhase(result.gate.fired ? "gate" : "done");
      } catch (cause) {
        setError(describe(cause));
        setPhase("ready");
      }
    },
    [bytes, options],
  );

  const current = useMemo(() => {
    if (!outcome) return null;
    return chosen === "alternative" && outcome.alternative ? outcome.alternative : outcome.primary;
  }, [outcome, chosen]);

  const download = useCallback(() => {
    if (!current || !file) return;
    const blob = new Blob([current.bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${file.name.replace(/\.pdf$/i, "")}-compressed.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [current, file]);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">File Compressor</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Compresses a PDF to the smallest file that still passes a perceptual check on every page, instead of applying
          one quality setting and hoping. Runs entirely in this tab — the file is never uploaded.
        </p>
      </header>

      {error ? (
        <Card className="mb-5 border-fail/40 bg-fail/5">
          <p className="text-sm text-ink">{error}</p>
        </Card>
      ) : null}

      {phase === "idle" || phase === "analysing" ? (
        <>
          <DropZone onFile={accept} busy={phase === "analysing"} />
          {phase === "analysing" ? (
            <p className="mt-4 text-center text-sm text-ink-2">Reading the object graph…</p>
          ) : (
            <Explainer />
          )}
        </>
      ) : null}

      {phase === "ready" && inventory && file ? (
        <AnalysisPanel
          inventory={inventory}
          fileName={file.name}
          options={options}
          onOptions={setOptions}
          onCompress={() => compress()}
          onReset={reset}
        />
      ) : null}

      {phase === "compressing" && file ? <ProgressPanel progress={progress} fileName={file.name} /> : null}

      {phase === "gate" && outcome ? (
        <GateDialog
          gate={outcome.gate}
          primary={outcome.primary}
          alternative={outcome.alternative}
          onChoose={(which) => {
            setChosen(which);
            setPhase("done");
          }}
          onCompare={(which) => setComparing(which)}
          onAdjust={() => setPhase("ready")}
        />
      ) : null}

      {phase === "done" && current && inventory && file ? (
        <ResultPanel
          result={current}
          inventory={inventory}
          fileName={file.name}
          onDownload={download}
          onCompare={() => setComparing(chosen)}
          onRecompress={(mode) => compress(mode)}
          onReset={reset}
        />
      ) : null}

      {comparing && outcome && current ? (
        <ComparisonViewer
          client={client.current!}
          jobId={`job-${jobId.current}`}
          which={comparing}
          result={current}
          floor={MODES[current.mode].pageFloor}
          onClose={() => setComparing(null)}
        />
      ) : null}
    </main>
  );
}

function Explainer() {
  return (
    <section className="mt-10 grid gap-5 sm:grid-cols-3">
      {[
        {
          title: "It looks at its own output",
          body: "Every image is compressed, decoded again, and compared against the original. Anything that scores below the mode's floor is rejected and the original stream is kept.",
        },
        {
          title: "The ratio is not the point",
          body: "A 90% reduction can mean the file was bloated, or that we destroyed something. When a file shrinks past 80% we stop and show you which pages changed.",
        },
        {
          title: "Nothing is uploaded",
          body: "Parsing, encoding, scoring and rendering all happen in this browser tab. Close it and every trace is gone.",
        },
      ].map((item) => (
        <Card key={item.title}>
          <h2 className="font-medium text-ink">{item.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
        </Card>
      ))}
    </section>
  );
}

function describe(cause: unknown): string {
  if (cause instanceof CompressorError) return cause.message;
  return cause instanceof Error ? cause.message : String(cause);
}
