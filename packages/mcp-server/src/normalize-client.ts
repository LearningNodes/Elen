/** K1 slug normalisation for X-MCP-Client / X-Elen-Client. */
export function normalizeClientName(raw: string): string {
  let s = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 40) s = s.slice(0, 40).replace(/-+$/g, '');
  return s || 'api-key';
}
