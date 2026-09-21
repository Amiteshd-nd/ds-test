/*
 * Palettes for the generated project artwork: [deep, mid, hot, spark].
 *
 * Deep is the ground, spark is the one near-white highlight that makes the smear
 * read as light rather than as paint. Kept in its own module so ProjectMark can
 * stay a component file and keep fast refresh.
 */
export const MARK_PALETTES = {
  ember: ['#1a0704', '#8c1d0a', '#f2581a', '#ffd9a6'],
  signal: ['#170a02', '#a33208', '#ff7a18', '#ffe9c7'],
  moss: ['#04140d', '#0f5132', '#3ddc84', '#dcffe9'],
  dusk: ['#0b0618', '#3b1e6e', '#8b5cf6', '#e9defd'],
  steel: ['#080a0f', '#27313f', '#7f96b3', '#e4edf7'],
  citrus: ['#161000', '#7a5c00', '#f5c518', '#fff4cc'],
  tide: ['#020f14', '#0b4a5e', '#22b8d6', '#d6f6ff'],
  rose: ['#170410', '#8a1049', '#ff4083', '#ffd9e6'],
};
