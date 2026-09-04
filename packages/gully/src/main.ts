import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './report.css';
import './decide.css';
import './compare.css';

import maplibregl from 'maplibre-gl';
import segmentsUrl from '@data/segments.geojson?url';
import scale from '@data/render-scale.json';
import { CENTRE, LAYOUT_NAME, LAYOUT_SUBTITLE } from '../pilot.config';
import { createMap, type MapHandles } from './map';
import { renderInspector } from './inspector';
import { legendHtml, statLine } from './stats';
import { Capture } from './report/capture';
import { Queue } from './report/queue';
import { buildSnapIndex } from './report/snap';
import { allReports, saveReport } from './report/store';
import { simulatedFix } from './report/sensors';
import { buildEvents } from './state/engine';
import {
  bucketLabel,
  buildRhythm,
  cellKey,
  DOW_LABELS,
  MIN_DAYS,
  type Rhythm,
} from './rhythm/aggregate';
import { demoEnabled, seedReports, setDemo } from './state/seed';
import type { BlockageEvent, SegmentFacts } from './state/types';
import { Decide } from './decide/panel';
import { Compare } from './compare/panel';
import { recordDecision, recordView } from './metrics';
import { RoadGraph } from './route/graph';
import { Enroute } from './decide/enroute';
import { addExit, directionOf, isExit, removeExit } from './decide/exits';
import type { ObstructionType } from './report/types';
import { bearing, type LngLat } from './report/geo';
import type { ColourMode, RenderScale, SegmentCollection, SegmentFeature } from './types';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

async function main() {
  const segments: SegmentCollection = await (await fetch(segmentsUrl)).json();
  const features = segments.features;
  const byId = new Map(features.map((f) => [f.properties.id, f]));

  // node id → segments touching it, for keyboard traversal along the graph
  const atNode = new Map<number, string[]>();
  for (const f of features) {
    for (const n of [f.properties.from_node, f.properties.to_node]) {
      if (!atNode.has(n)) atNode.set(n, []);
      atNode.get(n)!.push(f.properties.id);
    }
  }

  $('#layout-name').textContent = LAYOUT_NAME;
  $('#layout-sub').textContent = LAYOUT_SUBTITLE;
  $('#stat-line').innerHTML = statLine(features);

  const bounds = new maplibregl.LngLatBounds();
  for (const f of features) for (const c of f.geometry.coordinates) bounds.extend(c);

  let selected: string | null = null;
  let mode: ColourMode = 'plain';

  const handles: MapHandles = await createMap(
    'map',
    segments,
    scale as unknown as RenderScale,
    bounds,
    (id) => select(id, false),
  );

  const inspector = $('#inspector');

  function select(id: string | null, recentre: boolean) {
    selected = id;
    handles.setSelected(id);
    renderInspector(inspector, id ? byId.get(id)!.properties : null);
    if (id) renderExitControl(id);
    if (id && recentre) {
      const f = byId.get(id)!;
      const b = new maplibregl.LngLatBounds();
      for (const c of f.geometry.coordinates) b.extend(c);
      handles.map.fitBounds(b, { padding: 140, maxZoom: 18.5, duration: 420 });
    }
  }

  /**
   * The bridge between the layout and the panel: a road you are looking at
   * becomes one of the exits you decide between. Appended to the inspector
   * rather than baked into it, because it is a Phase 3 concern and the
   * inspector is a Phase 1 component.
   */
  function renderExitControl(id: string) {
    const seg = segmentFacts.get(id);
    if (!seg) return;
    const already = isExit(id);
    const btn = document.createElement('button');
    btn.className = `inspector__exit${already ? ' is-on' : ''}`;
    btn.textContent = already ? 'One of my exits — remove' : 'Use as my exit';
    btn.addEventListener('click', () => {
      if (already) {
        removeExit(id);
      } else {
        const { added, reason } = addExit(seg, exitDirection(id));
        if (!added && reason) {
          const toast = document.createElement('p');
          toast.className = 'report-toast';
          toast.textContent = `Not added — ${reason}.`;
          document.body.append(toast);
          setTimeout(() => toast.remove(), 3200);
        }
      }
      pickingExit = false;
      select(id, false);
      void refoldEvents();
    });
    inspector.append(btn);
  }

  // ── the rhythm heat layer ─────────────────────────────────────────────────
  // A slot the layout has not been watched through gets the casing grey, never
  // green: "nobody has looked" and "usually clear" are different answers, and
  // painting them alike is the one thing a heat map must not do.
  const scrub = { dow: new Date().getDay(), bucket: 33 }; // 08:15

  function rhythmColours(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of features) {
      const cell = rhythm.get(cellKey(f.properties.id, scrub.dow, scrub.bucket));
      if (!cell || cell.n_days < MIN_DAYS) {
        out[f.properties.id] = '#8A9691';
        continue;
      }
      out[f.properties.id] =
        cell.p_blocked >= 0.5 ? '#A63A26' : cell.p_blocked >= 0.2 ? '#B5811C' : '#3E6E52';
    }
    return out;
  }

  const scrubber = $('#scrubber');

  function renderScrubber() {
    scrubber.innerHTML = `
      <div class="scrubber__row">
        <select data-scrub="dow" aria-label="Day of week">
          ${DOW_LABELS.map(
            (d, i) => `<option value="${i}"${i === scrub.dow ? ' selected' : ''}>${d}</option>`,
          ).join('')}
        </select>
        <p class="scrubber__time">${bucketLabel(scrub.bucket)}</p>
      </div>
      <input type="range" min="0" max="95" value="${scrub.bucket}" data-scrub="bucket"
             aria-label="Time of day" />
      <p class="scrubber__note">Built from past reports only. Grey means fewer than ${MIN_DAYS} days seen.</p>`;
  }

  scrubber.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.scrub !== 'bucket') return;
    scrub.bucket = Number(el.value);
    renderScrubber();
    handles.setRhythmColours(rhythmColours());
  });

  scrubber.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    if (el.dataset.scrub !== 'dow') return;
    scrub.dow = Number(el.value);
    renderScrubber();
    handles.setRhythmColours(rhythmColours());
  });

  // ── overlay toggles ───────────────────────────────────────────────────────
  const legend = $('#legend');
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.toggle')) {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode as ColourMode;
      for (const b of document.querySelectorAll<HTMLButtonElement>('.toggle')) {
        const on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      }
      handles.setMode(mode);
      scrubber.hidden = mode !== 'rhythm';
      if (mode === 'rhythm') {
        renderScrubber();
        handles.setRhythmColours(rhythmColours());
      }
      const html = legendHtml(mode, features);
      legend.hidden = html === null;
      legend.innerHTML = html ?? '';
    });
  }

  // ── keyboard traversal ────────────────────────────────────────────────────
  // Arrow keys walk the graph: right/down through the segments joined at this
  // one's end node, left/up through those at its start node.
  function step(dir: 'from' | 'to') {
    if (!selected) return select(features[0].properties.id, true);
    const current = byId.get(selected)!.properties;
    const node = dir === 'from' ? current.from_node : current.to_node;
    const ring = (atNode.get(node) ?? []).filter((id) => id !== selected);
    if (!ring.length) return;
    // Cycle deterministically so repeated presses explore every branch.
    const idx = (lastBranch.get(node) ?? -1) + 1;
    lastBranch.set(node, idx);
    select(ring[idx % ring.length], true);
  }
  const lastBranch = new Map<number, number>();

  // Up/down walk the full list instead, so every segment stays reachable even
  // where the graph is cut into pieces by the polygon edge.
  function shift(delta: number) {
    const at = selected ? features.findIndex((f) => f.properties.id === selected) : -1;
    const next = (at + delta + features.length) % features.length;
    select(features[next].properties.id, true);
  }

  $('#map').addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); step('to'); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); step('from'); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); shift(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); shift(-1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); select(null, false); }
    else if (ev.key === 'Enter' && !selected) { ev.preventDefault(); select(features[0].properties.id, true); }
  });

  // ── Phase 2: report capture ───────────────────────────────────────────────
  // The snap index is built from the same geometry the map draws, so a report
  // lands on the segment the reporter can see under their thumb.
  const snapIndex = buildSnapIndex(
    features.map((f) => ({
      id: f.properties.id,
      coordinates: f.geometry.coordinates as LngLat[],
    })),
  );

  const lookup = (id: string) => {
    const p = byId.get(id)?.properties;
    return p ? { name: p.name, width_m: p.width_m, tanker_gap_m: p.tanker_gap_m } : undefined;
  };

  // ── Phase 3: state engine + decide panel ─────────────────────────────────
  const segmentFacts = new Map<string, SegmentFacts>(
    features.map((f) => [
      f.properties.id,
      {
        id: f.properties.id,
        name: f.properties.name,
        width_m: f.properties.width_m,
        lanes: f.properties.lanes,
        oneway: f.properties.oneway,
      },
    ]),
  );

  const geometry = new Map<string, LngLat[]>(
    features.map((f) => [f.properties.id, f.geometry.coordinates as LngLat[]]),
  );

  // Seeded reports are merged at read time and never written to storage, so a
  // demo can never contaminate a real queue. See src/state/seed.ts.
  let events: BlockageEvent[] = [];
  let rhythm: Rhythm = new Map();
  async function refoldEvents() {
    const real = await allReports();
    const seeded = demoEnabled()
      ? seedReports([...segmentFacts.values()], Date.now(), wellConnected)
      : [];
    events = buildEvents([...real, ...seeded], { now: Date.now(), segments: segmentFacts });
    // Rhythm folds only closed events, so it is derived here rather than cached:
    // it changes every time an event ends, which is every few minutes.
    rhythm = buildRhythm(events, Date.now());
    if (!scrubber.hidden) handles.setRhythmColours(rhythmColours());
    decide.render();
  }

  /** Which way a road lies from the middle of the layout — the "east" in
      "2nd Cross east". Distinguishes the many roads OSM never named. */
  const exitDirection = (segmentId: string) => {
    const line = geometry.get(segmentId);
    if (!line) return 'east' as const;
    const mid = line[Math.floor(line.length / 2)];
    return directionOf(bearing([CENTRE.lng, CENTRE.lat], mid));
  };

  const decide = new Decide({
    segments: segmentFacts,
    events: () => events,
    directionOf: exitDirection,
    rhythm: () => rhythm,
    demo: demoEnabled,
    onToggleDemo: () => {
      setDemo(!demoEnabled());
      void refoldEvents();
    },
    onPickExit: () => {
      showView('layout');
      pickingExit = true;
      renderPickHint();
    },
    onFocus: (id) => {
      recordDecision();
      showView('layout');
      select(id, true);
    },
    onViewed: (recommended) => recordView(recommended),
    onRecheck: async (segmentId, type, stillThere) => {
      // A recheck is a real report from this device, not a state poke. Saying
      // "still there" restarts the dwell clock because the obstruction is,
      // as of now, still there.
      const f = byId.get(segmentId);
      if (!f) return;

      // The segment is already known, so it is asserted rather than re-derived.
      // Snapping from the segment's first coordinate lands on a junction node
      // shared with its neighbour, and the answer to "is the tanker still on
      // THIS road" would get filed against the road next to it.
      const line = f.geometry.coordinates;
      const [lng, lat] = line[Math.floor(line.length / 2)];
      const fix = simulatedFix(lat, lng, null);
      const snapped = {
        segment_id: segmentId,
        snap_distance_m: 0,
        locate: 0.5,
        segment_bearing_deg: 0,
        decided_by: 'distance' as const,
        alternatives: [],
      };
      await saveReport({
        kind: stillThere ? 'obstruction' : 'clear',
        source: 'tap',
        fix,
        snap: snapped,
        obstruction_type: stillThere ? (type as ObstructionType) : null,
        classifier_conf: null,
        corrected: false,
        capture_ms: 0,
        redaction: null,
        photo: null,
      });
      await refoldEvents();
    },
    onChanged: () => void refoldEvents(),
  });
  decide.mount($('#decide'));

  const enroute = new Enroute({ segments: segmentFacts, geometry, events: () => events });

  // ── Phase 4: routing and the incumbent comparison ─────────────────────────
  const graph = new RoadGraph(
    features.map((f) => ({
      ...segmentFacts.get(f.properties.id)!,
      length_m: f.properties.length_m,
      from_node: f.properties.from_node,
      to_node: f.properties.to_node,
    })),
  );

  const nodeDegree = new Map<number, number>();
  for (const f of features) {
    for (const n of [f.properties.from_node, f.properties.to_node]) {
      nodeDegree.set(n, (nodeDegree.get(n) ?? 0) + 1);
    }
  }
  const wellConnected = (id: string) => {
    const p = byId.get(id)?.properties;
    if (!p) return false;
    return (nodeDegree.get(p.from_node) ?? 0) > 1 && (nodeDegree.get(p.to_node) ?? 0) > 1;
  };

  const nodePoints = new Map<number, LngLat>();
  for (const f of features) {
    const line = f.geometry.coordinates as LngLat[];
    nodePoints.set(f.properties.from_node, line[0]);
    nodePoints.set(f.properties.to_node, line[line.length - 1]);
  }

  const compare = new Compare({
    graph,
    segments: segmentFacts,
    geometry,
    nodeOf: (id, end) => {
      const p = byId.get(id)?.properties;
      return end === 'from' ? (p?.from_node ?? 0) : (p?.to_node ?? 0);
    },
    originFor: (destination: number) =>
      graph.connectedOriginFor(
        destination,
        CENTRE.lng,
        CENTRE.lat,
        (id) => (geometry.get(id) ?? []) as [number, number][],
      ),
    // The middle of the layout stands in for "home". Every trip out of a layout
    // starts somewhere inside it, and picking a house on a map is a whole flow
    // that Phase 4 does not need.
    pointOfNode: (node) => nodePoints.get(node) ?? null,
    events: () => events,
    onShowRoute: (lines) => {
      showView('layout');
      handles.setRoute(lines as never);
    },
  });
  compare.mount($('#compare'));

  // ── view switch ───────────────────────────────────────────────────────────
  let pickingExit = false;

  function showView(view: 'layout' | 'decide' | 'compare') {
    $('.stage').hidden = view !== 'layout';
    $('#decide').hidden = view !== 'decide';
    $('#compare').hidden = view !== 'compare';
    for (const b of document.querySelectorAll<HTMLButtonElement>('.views button')) {
      const on = b.dataset.view === view;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    }
    if (view === 'decide') void refoldEvents();
    else if (view === 'compare') void compare.render();
    else handles.map.resize();
  }

  for (const b of document.querySelectorAll<HTMLButtonElement>('.views button')) {
    b.addEventListener('click', () => showView(b.dataset.view as 'layout' | 'decide' | 'compare'));
  }

  function renderPickHint() {
    if (!pickingExit) return;
    const hint = document.createElement('p');
    hint.className = 'report-toast';
    hint.textContent = 'Tap a road, then "Use as my exit".';
    document.body.append(hint);
    setTimeout(() => hint.remove(), 3600);
  }

  const queue = new Queue(lookup, () => events);
  const capture = new Capture({
    index: snapIndex,
    lookup,
    mapCentre: () => {
      const c = handles.map.getCenter();
      return { lat: c.lat, lng: c.lng };
    },
    onSaved: (report) => {
      select(report.segment_id, false);
      void queue.render();
      void refoldEvents();
    },
  });

  const bar = document.createElement('div');
  bar.className = 'report-bar';
  bar.innerHTML = `
    <button class="report-bar__go" data-report="open">Report a blockage</button>
    <button class="report-bar__clear" data-report="clear">Road is clear</button>
    <button class="report-bar__queue" data-report="queue">On this phone</button>
    <button class="report-bar__ride" data-report="ride">Riding</button>
  `;
  $('#map').append(bar);

  bar.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-report]')?.dataset.report;
    if (act === 'open') void capture.open();
    // One tap, no screen in between — a negative report has to cost less than a
    // positive one, or the data set fills up with blockages that already cleared.
    if (act === 'clear') void capture.quickClear();
    if (act === 'queue') void queue.toggle();
    if (act === 'ride') {
      const btn = bar.querySelector('.report-bar__ride')!;
      if (enroute.active) {
        enroute.stop();
        btn.classList.remove('is-on');
        btn.textContent = 'Riding';
      } else {
        void enroute.start();
        btn.classList.add('is-on');
        btn.textContent = 'Riding — warnings on';
      }
    }
  });

  void refoldEvents();
  // Wall-clock only: "since 08:15" and "usually clears by 08:37" both go stale
  // on their own, with no new reports involved.
  setInterval(() => {
    if (!$('#decide').hidden) void refoldEvents();
  }, 30_000);

  // Exposed so the true-width claim can be checked from the console against
  // map.unproject(): metres per pixel must match data/render-scale.json.
  Object.assign(window as unknown as Record<string, unknown>, {
    gully: {
      map: handles.map,
      features: features as SegmentFeature[],
      capture,
      queue,
      snapIndex,
      decide,
      enroute,
      compare,
      graph,
      events: () => events,
      rhythm: () => rhythm,
      refoldEvents,
    },
  });
}

main().catch((err) => console.error('[gully] boot failed', err));
