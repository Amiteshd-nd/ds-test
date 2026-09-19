// Enough JSON Schema to validate a tool call, and no more. §8.3: validate structured
// output against the schema and retry once with the validation error appended before
// failing — which only works if the error says something a model can act on.

import type { JsonSchema } from '../adapters/types.ts';

export interface ValidationIssue { path: string; message: string }

export function validateAgainstSchema(value: unknown, schema: JsonSchema, path = '$'): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const typeOf = (v: unknown): string => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  const actual = typeOf(value);
  const wanted = schema.type === 'integer' ? 'number' : schema.type;

  if (actual !== wanted) {
    issues.push({ path, message: `expected ${schema.type}, got ${actual}` });
    return issues;
  }
  if (schema.type === 'integer' && !Number.isInteger(value)) {
    issues.push({ path, message: 'expected an integer' });
  }
  if (schema.enum && !schema.enum.includes(value as string)) {
    issues.push({ path, message: `must be one of ${schema.enum.join(', ')}` });
  }
  if (schema.type === 'string' && schema.maxLength && (value as string).length > schema.maxLength) {
    issues.push({ path, message: `longer than ${schema.maxLength} characters` });
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    const n = value as number;
    if (schema.minimum !== undefined && n < schema.minimum) issues.push({ path, message: `below minimum ${schema.minimum}` });
    if (schema.maximum !== undefined && n > schema.maximum) issues.push({ path, message: `above maximum ${schema.maximum}` });
  }
  if (schema.type === 'array' && schema.items) {
    (value as unknown[]).forEach((item, i) => issues.push(...validateAgainstSchema(item, schema.items as JsonSchema, `${path}[${i}]`)));
  }
  if (schema.type === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) issues.push({ path: `${path}.${key}`, message: 'is required' });
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) issues.push(...validateAgainstSchema(obj[key], sub, `${path}.${key}`));
    }
    // Unknown properties are an error, not a warning: a model inventing an argument name
    // is a model that misread the tool, and silently dropping it hides that.
    for (const key of Object.keys(obj)) {
      if (schema.properties && !(key in schema.properties)) {
        issues.push({ path: `${path}.${key}`, message: 'is not a property of this schema' });
      }
    }
  }
  return issues;
}

export function describeIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.path} ${i.message}`).join('; ');
}
