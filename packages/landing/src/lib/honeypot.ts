/**
 * Name of the hidden field bots fill in. Deliberately plausible: a field called
 * "honeypot" is one a scraper learns to skip. Its own module so the client form
 * can import it without pulling zod into the browser bundle.
 */
export const HONEYPOT_FIELD = 'company';
