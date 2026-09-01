import { neon } from '@neondatabase/serverless';

// Neon's HTTP driver, not a TCP pool. Each serverless invocation is its own
// process, so a pool would be per-instance and dozens of cold Lambdas would
// exhaust Postgres' connection limit. Over HTTP there is nothing to exhaust.
let cached;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  cached ??= neon(process.env.DATABASE_URL);
  return cached;
}

// Postgres returns bigint as a string to avoid precision loss in JSON. Cents
// amounts and row ids are both far inside Number's safe range, so unwrap them
// at the boundary and keep plain numbers everywhere above this layer.
export const int = (value) => (value === null || value === undefined ? null : Number(value));
