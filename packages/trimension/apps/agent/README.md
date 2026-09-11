# @trimension/agent

The AI SDK 7 host. Connects to the session server as an ordinary client and drives the
five generated tools.

```bash
export ANTHROPIC_API_KEY=...
node --experimental-strip-types src/main.ts "how much wall is on the ground floor?"
```

Three things about this package are deliberate:

- **It has no privileged access.** It speaks the same websocket protocol the browser does
  and its commits go through the same validation. There is no agent endpoint.
- **It does not define its tools.** They are loaded from `crates/api/schemas/`, generated
  by `cargo xtask gen-schemas` from the Rust command registry. `assertNoDrift()` runs at
  startup so a stale schema fails on boot rather than mid-run.
- **Writes stop for a human.** `apply_commands` is `needsApproval`; the Rust side refuses
  unapproved writes independently, so this is the interface to the gate, not the gate.
