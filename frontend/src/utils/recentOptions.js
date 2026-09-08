// Builds a deduped autocomplete options list, ordered MOST RECENT FIRST,
// capped at `limit` entries — so AutoCompleteField dropdowns stay usable
// as data grows instead of listing every value ever entered.
//
// records: array of objects (already should be sorted newest-last or
//   any order — this function does its own recency sort)
// getValue: (record) => string | falsy — the field to extract (phone, company, etc.)
// getDate: (record) => string | number — an ISO date string, date, or timestamp
//   used to determine recency. If omitted, falls back to array order
//   (assumes records are already newest-first, e.g. most lists in this app are).
// limit: max number of unique options to return (default 30)
export function getRecentUniqueOptions(records, getValue, getDate, limit = 12) {
  const withDates = records
    .map((r) => ({ value: getValue(r), ts: getDate ? new Date(getDate(r)).getTime() : 0 }))
    .filter((r) => r.value);

  // If getDate was provided, sort newest first. Otherwise trust array order.
  if (getDate) withDates.sort((a, b) => b.ts - a.ts);

  const seen = new Set();
  const out = [];
  for (const { value } of withDates) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}