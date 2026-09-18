"use client";

import type { GateState } from "@/core/types";
import type { ResultView } from "@/worker/protocol";
import { formatPair, formatRatio } from "@/core/bytes";
import { VISUALLY_LOSSLESS_FLOOR } from "@/core/modes";
import { Button } from "./ui/primitives";

/**
 * The 80% disclosure gate (PRD §6).
 *
 * Two branches. The confident one still tells the user the file shrank
 * enormously — that is surprising information and hiding it damages trust — but
 * it does not block, because we have evidence there was no loss. The other
 * blocks, and its two buttons are deliberately equal: the smaller file is not
 * pre-selected and the safer file is not styled as a warning. Neither choice is
 * wrong.
 */
export function GateDialog({
  gate,
  primary,
  alternative,
  onChoose,
  onCompare,
  onAdjust,
}: {
  gate: GateState;
  primary: ResultView;
  alternative: ResultView | null;
  onChoose: (which: "primary" | "alternative") => void;
  onCompare: (which: "primary" | "alternative") => void;
  onAdjust: () => void;
}) {
  const affected = gate.pagesBelowVisuallyLossless;
  // A job that fell all the way back to the original has no page scores at all.
  const worstScore = primary.pageScores.length > 0 ? Math.min(...primary.pageScores) : null;
  const saferWorst =
    alternative && alternative.pageScores.length > 0 ? Math.min(...alternative.pageScores) : null;
  const worst = primary.worstPage;
  const [smallerSize, saferSize] = formatPair(primary.outputBytes, alternative?.outputBytes ?? primary.outputBytes);

  if (gate.branch === "confident") {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">
          This file compressed by {formatRatio(primary.ratio)} — more than we expected.
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          We checked every page against the original and found no visible difference: the lowest page score is{" "}
          <span className="tnum">{worstScore?.toFixed(1) ?? "—"}</span>, above the{" "}
          {VISUALLY_LOSSLESS_FLOOR} that marks the threshold of visual losslessness. The saving came from a file that
          was carrying more than it needed.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
          {primary.causes.slice(0, 4).map((cause) => (
            <li key={cause}>{cause}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => onChoose("primary")}>
            Continue
          </Button>
          <Button onClick={() => onCompare("primary")}>Compare pages anyway</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-warn/50 bg-surface p-5">
      <h2 className="text-lg font-semibold text-ink">
        This file compressed by {formatRatio(primary.ratio)}
        {primary.ratio > 0.8 ? " — more than we expected." : ", and one or more pages changed visibly."}
      </h2>

      <p className="mt-2 text-sm text-ink-2">
        {primary.causes[0] ?? "Most of the saving came from re-encoding images."}{" "}
        {affected.length > 0 ? (
          <>
            At this setting, {affected.length} of {primary.pageScores.length} page
            {primary.pageScores.length === 1 ? "" : "s"} show visible softening when zoomed past 100%.
            {worst ? ` Page ${worst.index + 1} is affected most.` : ""}
          </>
        ) : null}
      </p>

      {worst ? (
        <div className="mt-3">
          <Button onClick={() => onCompare("primary")}>Compare page {worst.index + 1}</Button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Choice
          title="Use the smaller file"
          detail={`${smallerSize}, ${formatRatio(primary.ratio)} smaller`}
          note={worstScore === null ? "No pages were scored." : `Worst page scores ${worstScore.toFixed(1)}.`}
          onClick={() => onChoose("primary")}
        />
        {alternative ? (
          <Choice
            title="Use the safer file"
            detail={`${saferSize}, ${formatRatio(alternative.ratio)} smaller`}
            note={
              saferWorst === null
                ? "No pages were scored."
                : saferWorst >= VISUALLY_LOSSLESS_FLOOR
                  ? "No visible change on any page."
                  : `Worst page scores ${saferWorst.toFixed(1)}.`
            }
            onClick={() => onChoose("alternative")}
          />
        ) : (
          <Choice
            title="Keep looking"
            detail="Change the mode and run again"
            note="This file was already compressed at the safest lossy setting."
            onClick={onAdjust}
          />
        )}
      </div>

      <button
        type="button"
        onClick={onAdjust}
        className="mt-4 text-sm text-ink-2 underline underline-offset-4 hover:text-ink"
      >
        Adjust settings
      </button>

      <p className="mt-3 text-xs text-ink-3">
        The original is still here — nothing is overwritten and you can change your mind.
      </p>
    </div>
  );
}

/** Both options get the same weight: same border, same background, same size. */
function Choice({
  title,
  detail,
  note,
  onClick,
}: {
  title: string;
  detail: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-line bg-surface-2 p-4 text-left transition-colors hover:border-ink-3"
    >
      <div className="font-medium text-ink">{title}</div>
      <div className="tnum mt-1 text-sm text-ink">{detail}</div>
      <div className="mt-1 text-xs text-ink-2">{note}</div>
    </button>
  );
}
