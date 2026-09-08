import { useState, useMemo } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// items: array of { id, date (ISO string), ... } — anything with a `date` field.
// getItemsForDay(iso) -> array, onItemClick(item), onDayClick(iso) optional.
export default function MonthCalendar({ items, getKey, getLabel, onItemClick }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const today = new Date();

  const byDate = useMemo(() => {
    const m = {};
    items.forEach((it) => {
      const iso = it.date;
      if (!iso) return;
      (m[iso] ||= []).push(it);
    });
    return m;
  }, [items]);

  const weeks = useMemo(() => {
    const first = startOfMonth(cursor);
    const firstWeekday = (first.getDay() + 6) % 7; // Monday = 0
    const gridStart = new Date(first);
    gridStart.setDate(gridStart.getDate() - firstWeekday);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      cells.push(d);
    }
    const w = [];
    for (let i = 0; i < 6; i++) w.push(cells.slice(i * 7, i * 7 + 7));
    return w;
  }, [cursor]);

  function prevMonth() { setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1)); }
  function nextMonth() { setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1)); }
  function goToday() { setCursor(startOfMonth(new Date())); }

  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--border)]">
        <div className="flex items-center gap-2">
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" onClick={prevMonth} aria-label="Previous month">‹</button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" onClick={nextMonth} aria-label="Next month">›</button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" onClick={goToday}>Today</button>
        </div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{monthLabel}</div>
        <div style={{ width: 120 }} />
      </div>

      <div className="grid grid-cols-7 text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold border-b border-[color:var(--border)]">
        {WEEKDAYS.map((w) => <div key={w} className="py-2 px-2 text-center">{w}</div>)}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((d, idx) => {
          const iso = toISO(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, today);
          const dayItems = byDate[iso] || [];
          return (
            <div
              key={idx}
              className="border-b border-r border-[color:var(--border)] p-1.5 align-top"
              style={{ minHeight: 92, opacity: inMonth ? 1 : 0.4 }}
            >
              <div
                className="text-[12px] font-mono"
                style={isToday ? { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "var(--brass)", color: "#fff" } : {}}
              >
                {d.getDate()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                {dayItems.slice(0, 3).map((it) => (
                  <button
                    key={getKey(it)}
                    onClick={() => onItemClick(it)}
                    className="text-left font-sans text-[11px] px-1.5 py-1 rounded-[4px] bg-[color:var(--brass-bg)] text-[color:var(--brass-dark)] cursor-pointer border-none truncate hover:opacity-80"
                    title={getLabel(it)}
                  >
                    {getLabel(it)}
                  </button>
                ))}
                {dayItems.length > 3 && (
                  <div className="text-[10.5px] text-[color:var(--text-3)]">+{dayItems.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}