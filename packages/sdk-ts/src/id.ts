import { randomBytes, createHash } from 'node:crypto';

export function createId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('base64url').slice(0, 10)}`;
}

export function createDecisionId(domain: string): string {
  // Analytical Prefix: 3 chars domain + 'A' (Agent) + 'T3' (Routine Tier)
  const d = domain.toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, 'X').substring(0, 3);
  const prefix = `${d}AT3`;
  return `dec:${prefix}-${randomBytes(4).toString('base64url').slice(0, 6)}`;
}

export function createConstraintSetId(atoms: string[]): string {
  const sorted = [...atoms].sort().join('|');
  const hash = createHash('sha256').update(sorted).digest('hex').substring(0, 8);
  return `cs:${hash}`;
}
