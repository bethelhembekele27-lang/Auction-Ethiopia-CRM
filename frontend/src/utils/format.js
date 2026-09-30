export function pad(n) { return String(n).padStart(4, "0"); }
export function todayISO() { return new Date().toISOString().slice(0, 10); }
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function daysBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}
export function countBy(arr, key) {
  const m = {};
  arr.forEach((x) => { m[x[key]] = (m[x[key]] || 0) + 1; });
  return Object.entries(m).map(([name, value]) => ({ name, value }));
}
export function nowStamp() {
  const n = new Date();
  return { d: n.toISOString().slice(0, 10), t: n.toTimeString().slice(0, 5) };
}

// Caller name is optional app-wide now, so anything embedding one needs a
// placeholder rather than rendering an empty gap.
export function displayName(name, fallback = "Unknown caller") {
  return (name || "").trim() || fallback;
}

// Local YYYY-MM-DD from an ISO datetime. NOT the same as todayISO()'s
// toISOString().slice(0,10), which reads the date in UTC — for Addis Ababa
// (UTC+3) that silently shows the PREVIOUS day for anything logged between
// midnight and 3am, which then breaks same-day report filters.
export function localDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// visitWindow = {dateFrom, dateTo, timeFrom, timeTo} from the backend.
// A setup-backed visit spans a whole date RANGE and a daily time window, so
// both ends are rendered when present; a single-date visit (pickup, legacy
// row) collapses to one date.
export function fmtWindow(w) {
  if (!w) return "—";
  const f = (d) => (isIsoDate(d) ? fmtDate(d) : d);
  const from = f(w.dateFrom), to = f(w.dateTo);
  const dates = from && to && from !== to ? `${from} – ${to}` : (from || to);
  const hours = w.timeFrom && w.timeTo ? `${w.timeFrom}–${w.timeTo}` : (w.timeFrom || "");
  if (!dates && !hours) return "—";
  return dates && hours ? `${dates} · ${hours}` : (dates || hours);
}

// True when a stored date is a plain ISO date (YYYY-MM-DD) — those load
// into the calendar picker; anything else (hand-typed text) loads into
// the free-text box instead.
export function isIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }

// Returns true if isoDate (YYYY-MM-DD) falls inside the named preset range,
// evaluated relative to "now" at call time.
export function dateInPreset(isoDate, preset) {
  if (!isoDate) return false;
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d)) return false;
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return d.getTime() === today0.getTime();
  if (preset === "yesterday") {
    const y = new Date(today0); y.setDate(y.getDate() - 1);
    return d.getTime() === y.getTime();
  }
  if (preset === "week") {
    const dow = today0.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const weekStart = new Date(today0); weekStart.setDate(weekStart.getDate() - mondayOffset);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    return d >= weekStart && d <= weekEnd;
  }
  if (preset === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  return true;
}