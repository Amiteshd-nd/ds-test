/**
 * The starting deck.
 *
 * A real, valid deck for a fictional business, so the builder is editing
 * something that already works rather than inventing a shape from a schema.
 * That is the same reason the landing template ships with example content, and
 * the same warning applies: every word of it has to be replaced.
 *
 * It uses seven of the eight layouts on purpose. A builder that starts from a
 * deck of nothing but bullet slides writes a deck of nothing but bullet slides.
 */

import type { Deck } from './deck.ts';

export const EXAMPLE_DECK: Deck = {
  design: { palette: 'cobalt', type: 'grotesk' },
  title: 'Wexford Tool Hire',
  subtitle: 'Plant and access hire for small builders',

  slides: [
    {
      layout: 'title',
      title: 'The kit is on site before the crew is',
      subtitle: 'Wexford Tool Hire. Plant and access hire across south Wales.',
    },
    {
      layout: 'statement',
      text: 'A small builder loses a day when the hire does not turn up. We built the business around that not happening.',
      note: 'Six vans, one depot, and no subcontracted delivery.',
    },
    {
      layout: 'bullets',
      title: 'What a customer actually needs from a hire firm',
      points: [
        'The machine there at seven, not "some time Tuesday"',
        'A price they can put in a quote',
        'Someone who answers the phone on site',
        'Kit that has been serviced since the last job',
      ],
    },
    {
      layout: 'metrics',
      title: 'Where we are',
      metrics: [
        { value: '412', label: 'Accounts on the books', note: 'Up from 310 in 2024' },
        { value: '96%', label: 'Deliveries inside the slot', note: 'Measured on every job' },
        { value: '£1.4m', label: 'Hire revenue, 2025' },
      ],
    },
    {
      layout: 'two-column',
      title: 'Why builders leave a national',
      left: {
        heading: 'What they get there',
        body: 'A call centre, a four hour delivery window, and a machine that arrives with the last job still on it.',
      },
      right: {
        heading: 'What they get here',
        body: 'The depot manager on a mobile, a named slot, and kit that has been through the workshop.',
      },
    },
    {
      layout: 'quote',
      quote: 'I stopped using the big firm after the third time a dumper showed up at two in the afternoon.',
      attribution: 'Dai Pritchard, Pritchard Groundworks, Caerphilly',
    },
    {
      layout: 'closing',
      title: 'Come and look at the yard',
      lines: [
        'Tom Wexford',
        'tom@wexfordtoolhire.example',
        '029 2018 7740',
        'Unit 4, Pentwyn Industrial Estate, Cardiff',
      ],
    },
  ],
};
