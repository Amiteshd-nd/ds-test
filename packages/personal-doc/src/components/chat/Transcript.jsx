import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { PROJECTS } from '../../lib/portfolioBrain';
import { IconCheck, IconCopy, IconExternal, IconRefresh } from './Icons';

/* Rendering for the conversation.
 *
 * Answers arrive as typed blocks rather than a string of markdown, which is
 * what lets a reply carry a stat strip or a project card without the UI having
 * to parse prose. The first block streams word by word; the rest ease in after
 * it lands, so the answer assembles itself instead of appearing all at once.
 *
 * Entry animations for those later blocks are CSS, not Framer. This subtree
 * re-renders on every streaming tick (~30x a second), and a JS animation with a
 * stagger delay restarts — and so re-waits its delay — on each of those
 * renders, leaving it frozen part-way when the stream stops. A CSS animation
 * is bound to the element, not the render, so it simply runs.
 */

const ACCENTS = {
  magenta: '#ff4ad6',
  violet: '#a758ff',
  cool: '#5292ff',
  warm: '#ff7a3d',
};

const rise = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring', stiffness: 300, damping: 30 },
};

/* ------------------------------------------------------------------ blocks */

function Paragraph({ text, limit }) {
  // limit === undefined means "fully revealed".
  const words = text.split(' ');
  const shown = limit === undefined ? words.length : Math.min(limit, words.length);
  return (
    <p className="text-[15.5px] leading-[1.68] text-white/80 md:text-[16px]">
      {words.slice(0, shown).join(' ')}
    </p>
  );
}

function Bullets({ items }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-[1.6] text-white/75">
          <span
            className="mt-[0.62em] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: 'var(--lg-bullet-fill)' }}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Stats({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {items.map((s, i) => (
        <div
          key={s.label}
          style={{ animationDelay: `${i * 55}ms` }}
          className="lg-surface lg-rise relative overflow-hidden rounded-2xl px-3.5 py-3"
        >
          <span
            className="lg-hairline"
            style={{ background: 'linear-gradient(180deg, var(--lg-rim-a), var(--lg-rim-b))' }}
          />
          <div className="text-[21px] font-semibold tracking-[-0.02em] text-white">{s.value}</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-white/45">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Cards({ ids }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {ids.map((id, i) => {
        const proj = PROJECTS[id];
        if (!proj) return null;
        const accent = ACCENTS[proj.accent] || ACCENTS.violet;
        return (
          <div key={id} className="lg-rise" style={{ animationDelay: `${i * 70}ms` }}>
            <Link
              to={proj.route}
              className="lg-surface lg-focus group relative flex items-center gap-3 overflow-hidden rounded-2xl p-2.5 transition-transform hover:-translate-y-0.5"
            >
              <span
                className="lg-hairline"
                style={{ background: `linear-gradient(140deg, ${accent}55, var(--lg-rim-b))` }}
              />
              <span
                aria-hidden="true"
                /* Blur radius is a token, not a utility: in a theme where
                   nothing else blurs, this reads as a hard-cut corner of ink
                   instead — same element, same accent, different material. */
                className="pointer-events-none absolute -left-8 -top-10 h-24 w-24 rounded-full opacity-45 transition-opacity group-hover:opacity-80"
                style={{ background: accent, filter: 'blur(var(--lg-bloom-blur))' }}
              />
              <img
                src={proj.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
              <span className="relative min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-white">{proj.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-white/50 line-clamp-2">
                  {proj.blurb}
                </span>
              </span>
              <span className="relative shrink-0 pr-1 text-white/30 transition-colors group-hover:text-white/70">
                <IconExternal size={15} />
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function Links({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target={l.external ? '_blank' : undefined}
          rel={l.external ? 'noreferrer noopener' : undefined}
          className="lg-surface-flat lg-focus inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] text-white/85 transition-colors hover:text-white"
        >
          {l.label}
          <span className="text-white/35">
            <IconExternal size={13} />
          </span>
        </a>
      ))}
    </div>
  );
}

function Note({ text }) {
  return (
    <p
      className="rounded-xl border-l-2 py-1 pl-3 text-[14px] leading-relaxed text-white/60"
      style={{ borderColor: 'var(--lg-quote-line)', borderLeftWidth: 'max(2px, var(--lg-border))' }}
    >
      {text}
    </p>
  );
}

function Block({ block, wordLimit }) {
  switch (block.type) {
    case 'p':
      return <Paragraph text={block.text} limit={wordLimit} />;
    case 'list':
      return <Bullets items={block.items} />;
    case 'stats':
      return <Stats items={block.items} />;
    case 'cards':
      return <Cards ids={block.ids} />;
    case 'links':
      return <Links items={block.items} />;
    case 'note':
      return <Note text={block.text} />;
    default:
      return null;
  }
}

/* ---------------------------------------------------------------- messages */

function Avatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
      style={{
        background: 'var(--lg-avatar-fill)',
        boxShadow: 'var(--lg-avatar-shadow)',
      }}
    />
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 py-1">
      <Avatar />
      <div className="flex items-center gap-1.5 pt-2" role="status" aria-label="Thinking">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-white/50"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -2.5, 0] }}
            transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.14 }}
          />
        ))}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onFollowUp, onRegenerate }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = message.blocks
      .map((b) => {
        if (b.type === 'p' || b.type === 'note') return b.text;
        if (b.type === 'list') return b.items.map((i) => `• ${i}`).join('\n');
        if (b.type === 'stats') return b.items.map((s) => `${s.value} — ${s.label}`).join('\n');
        if (b.type === 'links') return b.items.map((l) => `${l.label}: ${l.href}`).join('\n');
        return '';
      })
      .filter(Boolean)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the button simply does nothing rather than throw */
    }
  };

  const visible = message.blocks.slice(0, message.shown);

  return (
    <motion.div {...rise} className="flex items-start gap-3">
      <Avatar />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-4">
          {visible.map((block, i) => (
            <Block key={i} block={block} wordLimit={i === 0 ? message.words : undefined} />
          ))}
        </div>

        {message.done && (
          <div className="lg-rise mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copy answer"
                  className="lg-focus flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                >
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerate(message)}
                  aria-label="Answer again"
                  className="lg-focus flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                >
                  <IconRefresh size={14} />
                  Retry
                </button>
              </div>

              {message.followUps?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {message.followUps.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onFollowUp(f)}
                      className="lg-surface-flat lg-focus rounded-full px-3.5 py-2 text-[13px] text-white/70 transition-colors hover:text-white"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function UserMessage({ text }) {
  return (
    <motion.div {...rise} className="flex justify-end">
      <div className="lg-surface relative max-w-[86%] rounded-[20px] rounded-br-[8px] px-4 py-2.5 md:max-w-[75%]">
        <span
          className="lg-hairline"
          style={{ background: 'linear-gradient(160deg, var(--lg-rim-a), var(--lg-rim-b))' }}
        />
        <p className="whitespace-pre-wrap text-[15.5px] leading-[1.55] text-white/95">{text}</p>
      </div>
    </motion.div>
  );
}

export default function Transcript({ messages, thinking, onFollowUp, onRegenerate }) {
  return (
    <div className="flex flex-col gap-7" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map((m) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} text={m.text} />
        ) : (
          <AssistantMessage
            key={m.id}
            message={m}
            onFollowUp={onFollowUp}
            onRegenerate={onRegenerate}
          />
        ),
      )}
      {thinking && <TypingIndicator />}
    </div>
  );
}
