/**
 * The local queue, made visible.
 *
 * Two reasons this is a screen and not a console log. A reporter should be able
 * to see exactly what their phone is holding and what it has sent — that is the
 * other half of the plain-language data statement. And the Phase 2 exit
 * criterion is a median capture-to-submit under four seconds, which has to be
 * measured on the device it is claimed for, not on a laptop with a stopwatch.
 */
import { allReports, clearReports, remoteConfigured, sync } from './store';
import { OBSTRUCTION_LABELS, type LocalReport } from './types';
import { pilotMetrics, resetMetrics } from '../metrics';
import { spineConfigured } from '../official/bwssb';
import type { BlockageEvent } from '../state/types';

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function median(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class Queue {
  private root: HTMLElement;

  constructor(
    private lookup: (id: string) => { name: string } | undefined,
    private events: () => BlockageEvent[] = () => [],
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'queue';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Reports held on this phone');
    document.body.append(this.root);

    this.root.addEventListener('click', async (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.hide();
      if (act === 'sync') { await sync(); await this.render(); }
      if (act === 'resetmetrics') { resetMetrics(); await this.render(); }
      if (act === 'clear') {
        if (confirm('Delete every report held on this phone? Synced ones stay on the server.')) {
          await clearReports();
          await this.render();
        }
      }
    });
  }

  async toggle() {
    if (this.root.hidden) { await this.render(); this.root.hidden = false; }
    else this.hide();
  }

  hide() { this.root.hidden = true; }

  async render() {
    const rows = await allReports();
    const times = rows.map((r) => r.capture_ms).filter((n) => n > 0);
    const med = median(times);
    const corrected = rows.filter((r) => r.corrected).length;

    this.root.innerHTML = `
      <header class="queue__head">
        <h2>On this phone</h2>
        <button data-act="close" aria-label="Close">Close</button>
      </header>

      <p class="queue__stat">
        ${rows.length} report${rows.length === 1 ? '' : 's'}${
          med === null
            ? ''
            : ` · median <b>${(med / 1000).toFixed(1)} s</b> capture to sent`
        }${corrected ? ` · ${corrected} corrected` : ''}
      </p>
      <p class="queue__target">Phase 2 target: median under 4.0 s on a mid-range Android.</p>

      ${rows.length ? '' : '<p class="queue__empty">Nothing captured yet.</p>'}
      <ul class="queue__list">${rows.map((r) => this.row(r)).join('')}</ul>

      ${this.metricsBlock(rows)}

      <div class="queue__foot">
        <button data-act="sync" ${remoteConfigured ? '' : 'disabled'}>
          ${remoteConfigured ? 'Sync now' : 'No server configured'}
        </button>
        <button data-act="clear" class="queue__danger">Delete all</button>
      </div>
    `;
  }

  /**
   * PRD §7 Phase 5. Decision-changed rate is first because it is the only one
   * that decides whether the product is worth continuing.
   */
  private metricsBlock(reports: LocalReport[]): string {
    const m = pilotMetrics(reports, this.events());
    const pct = (v: number | null) => (v === null ? 'not enough yet' : `${Math.round(v * 100)}%`);
    const mins = (v: number | null) => (v === null ? 'not enough yet' : `${v.toFixed(0)} min`);
    const secs = (v: number | null) => (v === null ? 'not enough yet' : `${(v / 1000).toFixed(1)} s`);

    const lines: [string, string, boolean][] = [
      ['Decision changed', pct(m.decision_changed_rate), true],
      ['Report to corroboration', pct(m.corroboration_rate), false],
      ['Clear-time error', mins(m.clear_time_error_min), false],
      ['Time to decision', secs(m.time_to_decision_ms), false],
      [
        'Reports per week',
        m.reports_per_week === null ? 'not enough yet' : m.reports_per_week.toFixed(1),
        false,
      ],
    ];

    return `
      <section class="queue__metrics">
        <h3>Pilot metrics</h3>
        <dl>
          ${lines
            .map(
              ([k, v, lead]) =>
                `<div class="queue__metric${lead ? ' is-lead' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`,
            )
            .join('')}
        </dl>
        <p class="queue__metricnote">
          From ${m.views} panel view${m.views === 1 ? '' : 's'} on this device.
          Time saved is deliberately not measured — it is not credibly measurable.
          Live BWSSB spine: ${spineConfigured ? 'connected' : 'not configured'}.
        </p>
        <button data-act="resetmetrics">Reset metrics</button>
      </section>`;
  }

  private row(r: LocalReport): string {
    const road = this.lookup(r.segment_id)?.name ?? r.segment_id;
    const what =
      r.kind === 'clear' ? 'Clear' : OBSTRUCTION_LABELS[r.obstruction_type ?? 'other'];
    // A clear report has nothing to classify; saying "no classifier" there reads
    // as a fault rather than as the shape of the report.
    const conf =
      r.kind === 'clear' ? null
      : r.classifier_conf === null ? 'no classifier on device'
      : `${Math.round(r.classifier_conf * 100)}% sure`;
    return `
      <li class="queue__row queue__row--${r.kind}">
        <p class="queue__what">${what}<span>${fmtTime(r.created_at)}</span></p>
        <p class="queue__road">${road}</p>
        <p class="queue__meta">
          ${r.source}${conf ? ` · ${conf}` : ''} · snapped ${r.snap_distance_m} m ·
          ${(r.capture_ms / 1000).toFixed(1)} s ·
          ${r.synced ? 'sent' : 'held'}${r.redaction?.complete ? ' · photo attached' : ''}
        </p>
      </li>`;
  }
}
