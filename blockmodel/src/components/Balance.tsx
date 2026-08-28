"use client";

import { useEffect, useState } from "react";

// Small credit-balance badge so you never submit a scan blind.
export default function Balance() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; balance: number } | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    fetch("/api/balance")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not fetch balance.");
        setState({ kind: "ok", balance: j.balance });
      })
      .catch((e) => setState({ kind: "error", message: e.message }));
  }, []);

  if (state.kind === "loading") {
    return <span className="text-sm text-neutral-500">checking credits…</span>;
  }
  if (state.kind === "error") {
    return (
      <span className="text-sm text-amber-400" title={state.message}>
        credits unavailable
      </span>
    );
  }
  return (
    <span className="text-sm text-neutral-300">
      <strong className={state.balance <= 0 ? "text-red-400" : "text-neutral-100"}>{state.balance}</strong>{" "}
      credit{state.balance === 1 ? "" : "s"} left{" "}
      <span className="text-neutral-500">(≈ {state.balance} scans)</span>
    </span>
  );
}
