'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { joinWaitlist, type SignupState } from '@/app/actions';
import type { content } from '@/content';
import { HONEYPOT_FIELD } from '@/lib/honeypot';

type Copy = (typeof content)['form'];

/** Iteration 1 is dark glass and chrome; iteration 2 is paper and pills. */
type Tone = 'dark' | 'light';

const initialState: SignupState = { status: 'idle', email: '' };

const styles: Record<Tone, { input: string; button: string; support: string; alert: string; success: string; spinner: string }> = {
  dark: {
    input: 'glass-field rounded-(--radius) text-ink',
    button: 'chrome-button rounded-(--radius) focus-visible:outline-accent',
    support: 'text-ink-dim',
    alert: 'text-danger',
    success: 'text-ink',
    spinner: 'border-black/20 border-t-black',
  },
  light: {
    input: 'pill-field',
    button: 'pill-button',
    support: 'text-neutral-500',
    alert: 'text-[#b3261e]',
    success: 'text-[#141414]',
    spinner: 'border-white/30 border-t-white',
  },
};

/**
 * Works without JavaScript: the form posts to the server action and the page
 * re-renders with the returned state. With JavaScript it stays in place.
 */
export function WaitlistForm({ copy, tone = 'dark', center = false }: { copy: Copy; tone?: Tone; center?: boolean }) {
  const [state, formAction] = useActionState(joinWaitlist, initialState);
  // Controlled, so an error keeps what was typed. React resets uncontrolled
  // fields after every action, failed or not.
  const [email, setEmail] = useState(state.email);
  const [invalidOnBlur, setInvalidOnBlur] = useState(false);
  const s = styles[tone];

  const done = state.status === 'ok';
  const invalid = invalidOnBlur || (state.status === 'error' && state.reason === 'invalid');

  const message = done
    ? copy.success
    : invalid
      ? copy.invalid
      : state.status === 'error'
        ? copy.error
        : copy.support;
  const isAlert = !done && (invalid || state.status === 'error');

  return (
    // Fixed minimum height, so swapping the form for the success line does not
    // move anything else on the page.
    <div
      id="waitlist"
      className={`flex min-h-[calc(var(--control-height)*2+3.25rem)] flex-col sm:min-h-[calc(var(--control-height)+2.75rem)] ${center ? 'items-center' : ''}`}
    >
      {!done && (
        <form action={formAction} className="relative flex w-full flex-col gap-2 sm:flex-row">
          <label htmlFor="email" className="sr-only">
            {copy.label}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            placeholder={copy.placeholder}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (invalidOnBlur && event.target.validity.valid) setInvalidOnBlur(false);
            }}
            onBlur={(event) => setInvalidOnBlur(event.target.value !== '' && !event.target.validity.valid)}
            aria-invalid={invalid || undefined}
            aria-describedby="waitlist-message"
            className={`h-(--control-height) min-w-0 flex-1 px-4 text-base ${s.input}`}
          />

          {/* Honeypot. Off-screen rather than display:none, which bots learn to skip. */}
          <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
            <label>
              Company
              <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>

          <SubmitButton label={copy.submit} pendingLabel={copy.pending} className={s.button} spinner={s.spinner} />
        </form>
      )}

      <p
        id="waitlist-message"
        role="status"
        aria-live="polite"
        className={
          done
            ? `arrive flex min-h-(--control-height) items-center font-serif text-[clamp(1.375rem,2.2vw,1.75rem)] leading-tight ${s.success}`
            : `mt-3 text-(length:--text-small) leading-snug ${isAlert ? `font-medium ${s.alert}` : s.support}`
        }
      >
        {message}
      </p>
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  className,
  spinner,
}: {
  label: string;
  pendingLabel: string;
  className: string;
  spinner: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex h-(--control-height) shrink-0 cursor-pointer items-center justify-center gap-2 px-5 text-(length:--text-body) font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    >
      {pending && <span aria-hidden className={`spinner size-4 rounded-full border-2 ${spinner}`} />}
      {pending ? pendingLabel : label}
    </button>
  );
}
