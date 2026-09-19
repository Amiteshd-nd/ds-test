// Router policy conditions from cortex.config.yaml (§8.2).
//
// A deliberately tiny expression language — `path op literal` — rather than eval(). The
// config file is trusted, but a config file that can run arbitrary code is a config file
// someone will eventually template from user input.

export type Scope = Record<string, unknown>;

const EXPR = /^\s*([A-Za-z_][\w.]*)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/;

function read(scope: Scope, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, scope);
}

function literal(raw: string): unknown {
  const s = raw.trim();
  if (/^'.*'$/.test(s) || /^".*"$/.test(s)) return s.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  return s;
}

export function evaluate(expr: string, scope: Scope): boolean {
  const m = EXPR.exec(expr);
  if (!m) throw new Error(`router policy: cannot parse condition ${JSON.stringify(expr)}`);
  const [, path, op, rhs] = m;
  const left = read(scope, path);
  const right = literal(rhs);
  switch (op) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    default: return false;
  }
}
