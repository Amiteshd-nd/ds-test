/* docs/build-workflow.md §1 imports the runtime from lib/agent-runtime.ts, while
   grammar/ is where it's authored and versioned. Re-export rather than copy:
   determinism is the one thing that must not break, and two copies of a
   deterministic runtime are two runtimes. */
export * from '../grammar/agent-runtime';
