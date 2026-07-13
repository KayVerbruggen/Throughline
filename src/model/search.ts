/** Case-insensitive "does the query appear in any of these fields" test. */
export function matchText(query: string, ...fields: (string | string[] | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  for (const f of fields) {
    if (!f) continue;
    const values = Array.isArray(f) ? f : [f];
    for (const v of values) {
      if (v.toLowerCase().includes(q)) return true;
    }
  }
  return false;
}
