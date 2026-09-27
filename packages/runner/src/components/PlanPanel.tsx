'use client';

import styles from './workbench.module.css';

/**
 * The agent's `todo.md`, rendered.
 *
 * The file in the sandbox is the source of truth — this parses whatever the
 * agent last wrote rather than keeping a parallel list, so a plan panel that
 * disagrees with the file is not a state this can reach.
 *
 * Motion: a CSS transition on the checkbox, nothing else. Ticking an item is
 * frequent and the reader triggered it indirectly by watching a step succeed; a
 * colour change at `--motion-duration-quick` is feedback, and anything more
 * would be a list that jumps around while it is being read.
 */
export function PlanPanel({ todo }: { todo: string | null }) {
  const items = todo ? parse(todo) : [];

  if (items.length === 0) {
    return (
      <p className={styles.placeholder}>
        {todo === null
          ? 'The agent writes its plan here once it starts.'
          : 'No checklist items in todo.md yet.'}
      </p>
    );
  }

  return (
    <ul className={styles.plan}>
      {items.map((item, i) => (
        <li key={`${i}-${item.text}`} className={styles.planItem}>
          <span
            className={`${styles.planBox} ${item.done ? styles.planBoxDone : ''}`}
            aria-hidden
          />
          <span className={item.done ? styles.planItemDone : undefined}>
            {item.text}
          </span>
          <span className="sr-only">{item.done ? ' (done)' : ' (not done)'}</span>
        </li>
      ))}
    </ul>
  );
}

interface PlanItem {
  text: string;
  done: boolean;
}

/** Markdown task list items only. Headings and prose around them are ignored. */
function parse(todo: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const line of todo.split('\n')) {
    const match = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (match) items.push({ done: match[1].toLowerCase() === 'x', text: match[2].trim() });
  }
  return items;
}
