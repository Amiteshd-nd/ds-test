/**
 * Stage 6 — validate (FR-6.1 … FR-6.4).
 *
 * The rule this stage exists for: never return a broken file, and never fail
 * silently. Every check here is a hard gate, and a failure discards the output
 * rather than shipping it with a warning — first falling back to the
 * lossless-only result, then to the original bytes untouched.
 *
 * FR-6.2 is the subtle one. A font-subsetting bug that breaks text extraction is
 * invisible in a pixel diff: the page renders identically and the document is
 * no longer searchable, copyable, or readable by a screen reader. Comparing
 * extracted text is the only check that catches it.
 */

import type { Rect, ValidationReport } from "../types";
import { scoreRgba } from "../quality/score";
import { openDocument, renderPage, extractText, SCORING_DPI } from "./render";

export interface ValidationOutcome {
  report: ValidationReport;
  pageScores: number[];
  worstPage: { index: number; score: number; region: Rect | null } | null;
}

export async function validateOutput(
  originalBytes: Uint8Array,
  outputBytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<ValidationOutcome> {
  const notes: string[] = [];
  const report: ValidationReport = {
    opens: false,
    pageCountMatches: false,
    rendersAllPages: false,
    textExtractionMatches: false,
    fellBackTo: null,
    notes,
  };

  let original: Awaited<ReturnType<typeof openDocument>>;
  let output: Awaited<ReturnType<typeof openDocument>>;
  try {
    original = await openDocument(originalBytes);
  } catch (error) {
    notes.push(`The original file could not be re-opened for comparison: ${describe(error)}`);
    return { report, pageScores: [], worstPage: null };
  }

  try {
    output = await openDocument(outputBytes);
    report.opens = true;
  } catch (error) {
    notes.push(`The compressed file failed to open: ${describe(error)}`);
    return { report, pageScores: [], worstPage: null };
  }

  report.pageCountMatches = original.numPages === output.numPages;
  if (!report.pageCountMatches) {
    notes.push(`Page count changed: ${original.numPages} in, ${output.numPages} out.`);
  }

  const pageScores: number[] = [];
  let worstPage: ValidationOutcome["worstPage"] = null;
  let renderedAll = true;

  const pages = Math.min(original.numPages, output.numPages);
  for (let i = 1; i <= pages; i += 1) {
    onProgress?.(i - 1, pages);
    try {
      const before = await renderPage(original, i, SCORING_DPI);
      const after = await renderPage(output, i, SCORING_DPI);
      if (before.width !== after.width || before.height !== after.height) {
        renderedAll = false;
        notes.push(`Page ${i} changed size: ${before.width}x${before.height} -> ${after.width}x${after.height}.`);
        pageScores.push(0);
        continue;
      }
      const detail = scoreRgba(before, after);
      pageScores.push(detail.score);
      if (!worstPage || detail.score < worstPage.score) {
        worstPage = { index: i - 1, score: detail.score, region: detail.worst };
      }
    } catch (error) {
      renderedAll = false;
      notes.push(`Page ${i} failed to render: ${describe(error)}`);
      pageScores.push(0);
    }
  }
  onProgress?.(pages, pages);
  report.rendersAllPages = renderedAll;

  const beforeText = await extractText(original);
  const afterText = await extractText(output);
  const mismatches: number[] = [];
  for (let i = 0; i < Math.min(beforeText.length, afterText.length); i += 1) {
    if (normalise(beforeText[i]) !== normalise(afterText[i])) mismatches.push(i + 1);
  }
  report.textExtractionMatches = mismatches.length === 0 && beforeText.length === afterText.length;
  if (!report.textExtractionMatches) {
    notes.push(
      mismatches.length > 0
        ? `Text extraction differs on ${mismatches.length} page(s): ${mismatches.slice(0, 5).join(", ")}${mismatches.length > 5 ? "…" : ""}.`
        : "Text extraction returned a different number of pages.",
    );
  }

  await original.loadingTask.destroy();
  await output.loadingTask.destroy();

  return { report, pageScores, worstPage };
}

export function passed(report: ValidationReport): boolean {
  return report.opens && report.pageCountMatches && report.rendersAllPages && report.textExtractionMatches;
}

/** Whitespace and ligature differences are extraction artifacts, not damage —
 *  normalising them keeps the gate pointed at real breakage. */
function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
