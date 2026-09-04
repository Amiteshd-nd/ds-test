export type WidthSource = 'survey' | 'osm_tag' | 'osm_est' | 'inferred_lanes' | 'class_default';
export type Severity = 'blocked' | 'squeeze' | 'clear';

export interface SegmentProps {
  id: string;
  osm_way_id: number;
  name: string;
  highway: string;
  length_m: number;
  lanes: number | null;
  oneway: boolean;
  from_node: number;
  to_node: number;
  width_m: number;
  width_source: WidthSource;
  width_conf: number;
  width_note: string;
  tanker_gap_m: number;
  severity_if_tanker: Severity;
}

export interface SegmentFeature {
  type: 'Feature';
  id: number;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: SegmentProps;
}

export interface SegmentCollection {
  type: 'FeatureCollection';
  properties?: { layout?: string };
  features: SegmentFeature[];
}

export interface RenderScale {
  centre_lat: number;
  stops: [number, number][];
}

export type ColourMode = 'plain' | 'width_source' | 'tanker' | 'rhythm';
