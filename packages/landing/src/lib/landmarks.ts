/**
 * The buildings in the crowd behind iteration 2.
 *
 * `what` is how the image model is told to draw it (scripts/generate-stickers.mjs
 * saves the result as public/stickers/<slug>.png). `name` and `place` are what the
 * label shows when a sticker is clicked. `color` is the fill that appears on hover:
 * the building's real surface, as one flat colour.
 *
 * Add an entry, run the script, and the page picks it up.
 */
export type Landmark = {
  name: string;
  place: string;
  what: string;
  /** Any CSS colour. White buildings get a soft ivory so the fill still shows. */
  color: string;
  /** A second colour for the upper part, where the building has two materials. */
  tint?: string;
  /** A third for the bottom part (a pedestal, a plinth), else a darker step of `color`. */
  base?: string;
};

const ivory = '#f1e8d6';
const sandstone = '#d9b28c';
const redSandstone = '#c4694f';
const steel = '#a9b2ba';
const limestone = '#e3d3b0';
const marbleGrey = '#cfd3d6';

export const LANDMARKS: Record<string, Landmark> = {
  'eiffel-tower': { name: 'Eiffel Tower', place: 'Paris, France', color: '#8c6a4a', base: '#6f533b', tint: '#a8846a', what: 'the Eiffel Tower in Paris' },
  'taj-mahal': { name: 'Taj Mahal', place: 'Agra, India', color: ivory, base: '#d9c7a3', tint: '#f8f3e8', what: 'the Taj Mahal in Agra, with its central dome and four minarets' },
  'colosseum': { name: 'Colosseum', place: 'Rome, Italy', color: limestone, what: 'the Colosseum in Rome' },
  'big-ben': { name: 'Big Ben', place: 'London, United Kingdom', color: '#d9b96a', base: '#cfc3a5', tint: '#e8cf7a', what: 'Big Ben, the clock tower in London' },
  'sydney-opera-house': { name: 'Sydney Opera House', place: 'Sydney, Australia', color: ivory, tint: '#f7f1e4', what: 'the Sydney Opera House with its sail-shaped roofs' },
  'burj-khalifa': { name: 'Burj Khalifa', place: 'Dubai, United Arab Emirates', color: '#9fb6c9', tint: '#c3d4e2', what: 'the Burj Khalifa, the tall tapering skyscraper in Dubai' },
  'great-pyramid': { name: 'Great Pyramid of Giza', place: 'Giza, Egypt', color: '#dcc08a', what: 'the Great Pyramid of Giza' },
  'leaning-tower': { name: 'Leaning Tower of Pisa', place: 'Pisa, Italy', color: ivory, what: 'the Leaning Tower of Pisa, tilted' },
  'golden-gate': { name: 'Golden Gate Bridge', place: 'San Francisco, United States', color: '#e8562a', tint: '#f0744a', what: 'the Golden Gate Bridge with its two suspension towers' },
  'statue-of-liberty': { name: 'Statue of Liberty', place: 'New York, United States', color: '#7fb3a0', base: '#b9b5a8', tint: '#8fc4b0', what: 'the Statue of Liberty' },
  'petronas-towers': { name: 'Petronas Towers', place: 'Kuala Lumpur, Malaysia', color: steel, tint: '#c8d8e6', what: 'the Petronas Twin Towers in Kuala Lumpur with their skybridge' },
  'space-needle': { name: 'Space Needle', place: 'Seattle, United States', color: '#e6e1d8', base: '#9ea3a8', tint: '#f4f1ea', what: 'the Space Needle in Seattle' },
  'sagrada-familia': { name: 'Sagrada Família', place: 'Barcelona, Spain', color: '#c9a77c', tint: '#d9bea0', what: 'the Sagrada Família in Barcelona with its tall spires' },
  'st-basils': { name: "Saint Basil's Cathedral", place: 'Moscow, Russia', color: '#d4514b', tint: '#5f9e6e', what: "Saint Basil's Cathedral in Moscow with its onion domes" },
  'parthenon': { name: 'Parthenon', place: 'Athens, Greece', color: ivory, what: 'the Parthenon in Athens with its columns' },
  'chrysler-building': { name: 'Chrysler Building', place: 'New York, United States', color: '#b8bcc2', tint: '#d6d9de', what: 'the Chrysler Building in New York with its art deco crown' },
  'guggenheim-bilbao': { name: 'Guggenheim Museum', place: 'Bilbao, Spain', color: '#c5c9cc', what: 'the Guggenheim Museum Bilbao with its curved titanium forms' },
  'fallingwater': { name: 'Fallingwater', place: 'Pennsylvania, United States', color: '#d8b98a', what: "Frank Lloyd Wright's Fallingwater, a house of cantilevered terraces over a waterfall" },
  'pantheon': { name: 'Pantheon', place: 'Rome, Italy', color: limestone, what: 'the Pantheon in Rome with its portico and dome' },
  'tokyo-tower': { name: 'Tokyo Tower', place: 'Tokyo, Japan', color: '#e8622d', base: '#e8622d', tint: '#f3efe6', what: 'Tokyo Tower, the lattice tower' },
  'gateway-of-india': { name: 'Gateway of India', place: 'Mumbai, India', color: '#c9a66b', what: 'the Gateway of India in Mumbai, the arch monument' },
  'lotus-temple': { name: 'Lotus Temple', place: 'New Delhi, India', color: ivory, base: '#c9b99a', what: 'the Lotus Temple in Delhi with its petal-shaped shells' },
  'pagoda': { name: 'Five-storey Pagoda', place: 'Nara, Japan', color: '#c8432f', tint: '#e06a52', what: 'a five-storey Japanese pagoda' },
  'angkor-wat': { name: 'Angkor Wat', place: 'Siem Reap, Cambodia', color: '#a9a391', what: 'Angkor Wat with its three lotus-bud towers' },
  'hagia-sophia': { name: 'Hagia Sophia', place: 'Istanbul, Türkiye', color: '#d9a08a', tint: '#efc4b2', what: 'the Hagia Sophia in Istanbul with its dome and minarets' },
  'brandenburg-gate': { name: 'Brandenburg Gate', place: 'Berlin, Germany', color: sandstone, what: 'the Brandenburg Gate in Berlin' },
  'cn-tower': { name: 'CN Tower', place: 'Toronto, Canada', color: '#c3c6c9', base: '#a3a7ab', what: 'the CN Tower in Toronto' },
  'flatiron': { name: 'Flatiron Building', place: 'New York, United States', color: '#d6b991', what: 'the Flatiron Building in New York, wedge-shaped' },
  'marina-bay-sands': { name: 'Marina Bay Sands', place: 'Singapore', color: '#d8dcdf', base: '#b9c0c6', tint: '#eef1f3', what: 'Marina Bay Sands in Singapore, three towers with a boat-shaped top' },
  'louvre-pyramid': { name: 'Louvre Pyramid', place: 'Paris, France', color: '#9fcad1', tint: '#bfe0e4', what: 'the glass Louvre Pyramid in Paris' },
  'villa-savoye': { name: 'Villa Savoye', place: 'Poissy, France', color: ivory, what: "Le Corbusier's Villa Savoye, a white box on thin columns with ribbon windows" },
  'stonehenge': { name: 'Stonehenge', place: 'Wiltshire, United Kingdom', color: '#b5b2a8', what: 'Stonehenge, the ring of standing stones' },
  'chichen-itza': { name: 'Chichén Itzá', place: 'Yucatán, Mexico', color: marbleGrey, what: 'the stepped pyramid of Chichén Itzá' },
  'dutch-canal-house': { name: 'Canal House', place: 'Amsterdam, Netherlands', color: '#a85a44', what: 'a tall narrow Amsterdam canal house with a stepped gable' },
  'tower-bridge': { name: 'Tower Bridge', place: 'London, United Kingdom', color: '#7fa7c9', what: 'Tower Bridge in London, the bascule bridge with two gothic towers' },
  'sydney-harbour-bridge': { name: 'Sydney Harbour Bridge', place: 'Sydney, Australia', color: steel, what: 'the Sydney Harbour Bridge, the steel through-arch bridge' },
  // India: a quarter of the crowd.
  'howrah-bridge': { name: 'Howrah Bridge', place: 'Kolkata, India', color: steel, tint: '#c4cbd1', what: 'the Howrah Bridge in Kolkata, the cantilever steel bridge' },
  'red-fort': { name: 'Red Fort', place: 'New Delhi, India', color: redSandstone, tint: '#d98668', what: 'the Red Fort in Delhi, its Lahori Gate with sandstone walls and chhatris' },
  'qutub-minar': { name: 'Qutub Minar', place: 'New Delhi, India', color: redSandstone, tint: '#dc8f72', what: 'the Qutub Minar in Delhi, the tall fluted minaret with balconies' },
  'hawa-mahal': { name: 'Hawa Mahal', place: 'Jaipur, India', color: '#e59c93', tint: '#f2c1ba', what: 'the Hawa Mahal in Jaipur, the honeycomb facade of small windows' },
  'golden-temple': { name: 'Golden Temple', place: 'Amritsar, India', color: '#e3b43c', base: '#f3eee2', tint: '#f0ca55', what: 'the Golden Temple in Amritsar, the Harmandir Sahib on the water' },
  'meenakshi-temple': { name: 'Meenakshi Temple', place: 'Madurai, India', color: '#6cb7a4', tint: '#9fd3c4', what: 'a gopuram tower of the Meenakshi Temple in Madurai, tiered and covered in sculptures' },
  'charminar': { name: 'Charminar', place: 'Hyderabad, India', color: '#d9c48f', what: 'the Charminar in Hyderabad, the four-minaret arch monument' },
  'mysore-palace': { name: 'Mysore Palace', place: 'Mysuru, India', color: '#d6a3a8', tint: '#e6c3c6', what: 'Mysore Palace, with its domes and arched facade' },
};

export const LANDMARK_SLUGS = Object.keys(LANDMARKS);
