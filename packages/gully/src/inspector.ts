import type { SegmentProps } from './types';
import { SEVERITY_COLOUR, SOURCE_COLOUR } from './map';

/** One consequence line, not a spec dump. */
function consequence(p: SegmentProps): string {
  const gap = p.tanker_gap_m.toFixed(1);
  if (p.lanes === 1 && p.oneway) {
    return `A water tanker fills the single lane. Nothing gets past until it moves.`;
  }
  if (p.severity_if_tanker === 'blocked') {
    return p.tanker_gap_m <= 0
      ? `A water tanker is wider than this road. Nothing gets past.`
      : `A water tanker leaves ${gap} m. A car cannot pass.`;
  }
  if (p.severity_if_tanker === 'squeeze') {
    return `A water tanker leaves ${gap} m. Bikes pass, cars queue.`;
  }
  return `A water tanker leaves ${gap} m. Traffic flows.`;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderInspector(el: HTMLElement, p: SegmentProps | null) {
  if (!p) {
    el.innerHTML = `
      <div class="inspector__empty">
        <p>Tap a road to read its width, where that number came from, and what a tanker leaves behind.</p>
        <p class="inspector__hint">Or focus the map and use the arrow keys.</p>
      </div>`;
    return;
  }

  const facts: [string, string][] = [
    ['Length', `${Math.round(p.length_m)} m`],
    ['Lanes', p.lanes ? String(p.lanes) : 'not tagged'],
    ['Direction', p.oneway ? 'one way' : 'two way'],
    ['Road class', p.highway.replace(/_/g, ' ')],
    ['OSM way', `${p.osm_way_id}`],
  ];

  el.innerHTML = `
    <h2 class="seg__name">${esc(p.name)}</h2>
    <p class="seg__id">${esc(p.id)}</p>

    <div class="seg__width"><b>${p.width_m.toFixed(1)}</b><span>m wide</span></div>
    <p class="seg__source">
      <span class="seg__dot" style="background:${SOURCE_COLOUR[p.width_source] ?? '#8A9691'}"></span>
      ${esc(sentence(p.width_note))}
    </p>
    <p class="seg__conf">Confidence ${p.width_conf.toFixed(2)}</p>

    <p class="seg__consequence seg__consequence--${p.severity_if_tanker}"
       style="border-left-color:${SEVERITY_COLOUR[p.severity_if_tanker]}">
      ${esc(consequence(p))}
    </p>

    <dl class="seg__facts">
      ${facts
        .map(([k, v]) => `<div class="seg__fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
        .join('')}
    </dl>

    <p class="seg__nav">
      <kbd>←</kbd> <kbd>→</kbd> follow the roads joined at this segment's ends.
      <kbd>↑</kbd> <kbd>↓</kbd> step through every segment. <kbd>Esc</kbd> clears.
    </p>`;
}
