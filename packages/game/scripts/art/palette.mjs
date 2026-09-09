/**
 * The project palette — nothing may use a colour outside it.
 *
 * A fixed palette is what makes separately-authored tiles read as one world.
 * It is also the difference between pixel art and a downscaled illustration:
 * the airport tileset shipped with ~254,000 unique colours and roughly 1,000
 * per 32x32 tile, which is why it cannot be palette-compressed and why
 * nearest-neighbour scaling makes it shimmer.
 *
 * Warm ochre plaster, grey concrete, steel shutters, dusty pavers — picked for
 * a Bengaluru street rather than a generic one.
 */
export const P = {
  asphalt: '#2b2f38',
  asphaltLit: '#353a45',
  asphaltWorn: '#414754',
  marking: '#d9d2c0',

  kerb: '#b5ada0',
  kerbShade: '#8e877c',
  paver: '#9c948a',
  paverAlt: '#8a8378',
  paverShade: '#746e64',

  plaster: '#d4a373',
  plasterShade: '#b8875a',
  plasterDeep: '#8f6642',
  concrete: '#a8a29a',
  concreteShade: '#8d877f',

  steel: '#6b7280',
  steelShade: '#545a66',
  wood: '#6b4a2f',
  woodShade: '#52381f',
  glass: '#6fa8c7',
  glassShade: '#4f8aa8',
  glassDeep: '#2f5a70',

  leaf: '#4f8a48',
  leafShade: '#3d6b3a',
  leafDeep: '#2b4f2a',
  trunk: '#5c4033',
  metal: '#7a8189',
  metalShade: '#5c626a',

  awningRed: '#b3403a',
  awningBlue: '#2f6fa8',
  cloth: '#e8e0d0',
  binGreen: '#3f5f47',

  skin: '#d9a074',
  skinShade: '#b87c50',
  hair: '#2b2320',
  shirt: '#3f6fa8',
  shirtShade: '#2f5486',
  trouser: '#3a4250',
  trouserShade: '#2b3140',
  shoe: '#23262c',

  ink: '#1e2128',
};

/** '#rrggbb' -> [r,g,b,255] */
export const rgba = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  255,
];

export const TRANSPARENT = [0, 0, 0, 0];
