/**
 * Which implementation of each interface this process uses.
 *
 * One file, read from the environment, so swapping a vendor is a config change
 * and never an edit to agent code. It is also the only place that knows a
 * development stand-in exists, and the only place that can refuse to hand one
 * out in production.
 */

import type { DeployProvider, LLMProvider, SandboxProvider, TraceSink } from './interfaces.ts';
import { CloudflarePagesProvider } from './deploy-cloudflare.ts';
import { LocalDeployProvider } from './deploy-local.ts';
import { AnthropicProvider } from './llm-anthropic.ts';
import { ScriptedProvider, defaultScriptRoutes } from './llm-scripted.ts';
import { LocalSandboxProvider } from './sandbox-local.ts';
import { E2BSandboxProvider } from './sandbox-e2b.ts';
import { JsonlTraceSink, NullTraceSink } from './trace-jsonl.ts';
import type { GrowthProviders } from '../growth/gate.ts';
import { OutboxEmailProvider, OutboxPublishProvider } from '../growth/outbox.ts';
import { PostizPublishProvider } from '../growth/postiz.ts';
import { ResendEmailProvider } from '../growth/resend.ts';

const isProduction = () => process.env.NODE_ENV === 'production';

export function sandboxProvider(): SandboxProvider {
  const choice = process.env.SANDBOX_PROVIDER ?? (isProduction() ? 'e2b' : 'local');

  if (choice === 'e2b') {
    const key = process.env.E2B_API_KEY;
    if (!key) throw new Error('SANDBOX_PROVIDER=e2b requires E2B_API_KEY');
    return new E2BSandboxProvider(key);
  }

  if (choice === 'local') {
    // The local sandbox is a scratch directory and a child process. Running
    // model-written code that way in a multi-tenant product is the exact
    // failure this refusal exists to prevent.
    if (isProduction()) {
      throw new Error(
        'the local sandbox is not isolation and must not run in production; set SANDBOX_PROVIDER=e2b',
      );
    }
    return new LocalSandboxProvider();
  }

  throw new Error(`unknown SANDBOX_PROVIDER: ${choice}`);
}

export function llmProvider(): LLMProvider {
  const choice =
    process.env.LLM_PROVIDER ??
    // With a key present, use it. Without one, fall back to the script rather
    // than failing to start — a first `pnpm dev` should show a working UI.
    (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
      ? 'anthropic'
      : 'scripted');

  if (choice === 'anthropic') return new AnthropicProvider();

  if (choice === 'scripted') {
    if (isProduction()) {
      throw new Error('LLM_PROVIDER=scripted is a test double and must not run in production');
    }
    return new ScriptedProvider(defaultScriptRoutes);
  }

  throw new Error(`unknown LLM_PROVIDER: ${choice}`);
}

export function deployProvider(): DeployProvider {
  const choice = process.env.DEPLOY_PROVIDER ?? 'local';

  if (choice === 'cloudflare') {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !account) {
      throw new Error(
        'DEPLOY_PROVIDER=cloudflare requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID',
      );
    }
    return new CloudflarePagesProvider(token, account);
  }

  if (choice === 'local') {
    // Not a refusal in production: a local deployment is a real, working URL
    // on this machine, and the UI labels it as such. It is just not public.
    return new LocalDeployProvider();
  }

  throw new Error(`unknown DEPLOY_PROVIDER: ${choice}`);
}

/**
 * Where a post or an email actually goes.
 *
 * `outbox` writes what would have been sent to `.runner/outbox.jsonl` and
 * returns `local: true`, which every surface showing the result repeats. It is
 * not refused in production the way the local sandbox is: an outbox in
 * production is a product that does not send, which is visible immediately,
 * rather than a security hole that is not.
 */
export function growthProviders(): GrowthProviders {
  const social = process.env.PUBLISH_PROVIDER ?? 'outbox';
  const mail = process.env.EMAIL_PROVIDER ?? 'outbox';

  const publish =
    social === 'postiz'
      ? new PostizPublishProvider(
          required('POSTIZ_URL', 'PUBLISH_PROVIDER=postiz'),
          required('POSTIZ_API_KEY', 'PUBLISH_PROVIDER=postiz'),
        )
      : social === 'outbox'
        ? new OutboxPublishProvider()
        : unknown('PUBLISH_PROVIDER', social);

  const email =
    mail === 'resend'
      ? new ResendEmailProvider(
          required('RESEND_API_KEY', 'EMAIL_PROVIDER=resend'),
          required('EMAIL_FROM', 'EMAIL_PROVIDER=resend'),
        )
      : mail === 'outbox'
        ? new OutboxEmailProvider()
        : unknown('EMAIL_PROVIDER', mail);

  return { publish, email };
}

function required(name: string, why: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${why} requires ${name}`);
  return value;
}

function unknown(name: string, value: string): never {
  throw new Error(`unknown ${name}: ${value}`);
}

export function traceSink(): TraceSink {
  const choice = process.env.TRACE_SINK ?? 'jsonl';
  if (choice === 'none') return new NullTraceSink();
  if (choice === 'jsonl') return new JsonlTraceSink();
  // Langfuse belongs here (PRD section 6.8). It needs an account nobody has
  // authorised yet, so it is absent rather than half-written.
  throw new Error(`unknown TRACE_SINK: ${choice}`);
}

/** What the UI shows in its footer, so nobody mistakes a scripted run for a real one. */
export function activeProviders(): {
  llm: string;
  sandbox: string;
  trace: string;
  deploy: string;
  publish: string;
  email: string;
} {
  const safely = (f: () => { name: string }) => {
    try {
      return f().name;
    } catch (err) {
      return `unavailable (${err instanceof Error ? err.message : String(err)})`;
    }
  };
  return {
    llm: safely(llmProvider),
    sandbox: safely(sandboxProvider),
    trace: safely(traceSink),
    deploy: safely(deployProvider),
    publish: safely(() => growthProviders().publish),
    email: safely(() => growthProviders().email),
  };
}
