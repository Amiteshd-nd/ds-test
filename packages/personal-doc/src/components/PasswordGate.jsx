import { useState } from 'react';
import { motion } from '@cloud-march/motion/react';
import { Link } from 'react-router-dom';
import { isUnlocked, remember, verify } from '../lib/gate';

/*
 * The screen in front of the two client case studies.
 *
 * It renders nothing of the case study until the passphrase checks out — see
 * lib/gate.js for the honest limits of what that buys, and for how to rotate
 * the passphrase.
 *
 * Tone matters here more than mechanism. Somebody hitting this is usually a
 * recruiter or a hiring manager following a link, so the screen says who to ask
 * and offers somewhere else to go, rather than reading like a 403.
 */

function IconLock({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export default function PasswordGate({ title, children }) {
  const [open, setOpen] = useState(isUnlocked);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (open) return children;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');
    const ok = await verify(value);
    setBusy(false);

    if (ok) {
      remember();
      setOpen(true);
      return;
    }

    setError('That is not it. Check the capitalisation, or ask me for it.');
    setValue('');
  };

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="grid min-h-screen place-items-center px-6 py-24"
    >
      <div className="w-full max-w-[420px]">
        <span
          aria-hidden="true"
          className="grid h-11 w-11 place-items-center rounded-full"
          style={{
            background: 'color-mix(in oklab, var(--site-fg) 8%, transparent)',
            color: 'var(--site-fg)',
          }}
        >
          <IconLock />
        </span>

        <h1
          className="mt-5 font-outfit text-[26px] leading-[1.25]"
          style={{ letterSpacing: '-0.5px', fontWeight: 'var(--site-weight-display)', color: 'var(--site-fg)' }}
        >
          {title}
        </h1>

        <p
          className="mt-3 font-outfit text-[15px] leading-[1.55]"
          style={{ color: 'var(--site-fg-2)' }}
        >
          This one was done under an NDA, so it is not open to the web. If you are
          reviewing my work, ask me for the passphrase and it will open here.
        </p>

        <form onSubmit={submit} className="mt-7">
          <label htmlFor="gate-pass" className="sr-only">
            Passphrase
          </label>

          <div
            className="flex items-center gap-2 rounded-2xl py-2 pl-4 pr-2"
            style={{
              background: 'var(--site-card)',
              border: 'var(--site-edge-width) solid var(--site-edge)',
              boxShadow: 'var(--site-card-rest)',
            }}
          >
            <input
              id="gate-pass"
              type="password"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError('');
              }}
              placeholder="Passphrase"
              autoComplete="off"
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'gate-error' : undefined}
              className="min-w-0 flex-1 bg-transparent py-2 font-outfit text-[15px] outline-none placeholder:opacity-50"
              style={{ color: 'var(--site-fg)' }}
            />

            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-full px-4 py-2 font-outfit text-[14px] transition-opacity disabled:opacity-55"
              style={{
                background: 'var(--site-fg)',
                color: 'var(--site-bg)',
                fontWeight: 'var(--site-weight-strong)',
              }}
            >
              {/* The wait is the 250k PBKDF2 rounds, not a network call. Saying
                  so beats a spinner that implies something is being sent. */}
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </div>

          {/* `role="alert"` so it is announced rather than silently appearing
              below a field the person has already tabbed away from. */}
          <p
            id="gate-error"
            role="alert"
            className="mt-3 min-h-[1.2em] font-outfit text-[13.5px]"
            style={{ color: error ? 'var(--site-accent)' : 'transparent' }}
          >
            {error || ' '}
          </p>
        </form>

        <p className="mt-6 font-outfit text-[13.5px]" style={{ color: 'var(--site-fg-2)' }}>
          <Link to="/works" className="underline underline-offset-2">
            Back to the work
          </Link>
          <span className="mx-2 opacity-40">·</span>
          <a href="mailto:amiteshdebnath98@gmail.com" className="underline underline-offset-2">
            Ask for access
          </a>
        </p>
      </div>
    </motion.main>
  );
}
