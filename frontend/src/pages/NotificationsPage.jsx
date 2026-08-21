import { todayISO } from "../utils/format";
import { NOTIFICATION_KIND_STYLE, timeAgo } from "../components/NotificationPopups";

/* ================================================================
   NOTIFICATIONS PAGE
   The bell's one and only destination. Shows every notification
   addressed to the signed-in user (already scoped to them by
   buildNotifications), grouped into Today / Earlier, each with a
   direct link into the record it's about and a way to clear it.
================================================================= */
export function NotificationsPage({ items, onClear, goTo }) {
  const todayStr = todayISO();
  const isToday = (ts) => new Date(ts).toISOString().slice(0, 10) === todayStr;
  const today = items.filter((n) => isToday(n.createdAt));
  const earlier = items.filter((n) => !isToday(n.createdAt));

  function Group({ label, list }) {
    if (!list.length) return null;
    return (
      <div style={{ marginBottom: 22 }}>
        <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[color:var(--text-2)] mt-[18px] mb-2" style={{ margin: "0 0 10px" }}>{label}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((n) => {
            const meta = NOTIFICATION_KIND_STYLE[n.kind] || NOTIFICATION_KIND_STYLE.reminder;
            return (
              <div className="flex gap-3.5 bg-[color:var(--panel)] border border-[color:var(--border)] border-l-[3px] border-l-[color:var(--border)] rounded-[10px] px-4 py-3.5" key={n.id} style={{ borderLeftColor: meta.color }}>
                <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-xs shrink-0 w-9 h-9 text-base" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center justify-between gap-2.5 mb-[3px]">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[11.5px] text-[color:var(--text-3)] whitespace-nowrap">{timeAgo(n.createdAt)}</span>
                  </div>
                  <div className="text-sm font-semibold mb-[3px]">{n.title}</div>
                  <div className="text-[13px] text-[color:var(--text-2)] leading-normal">{n.body}</div>
                  <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
                    {n.link && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-[color:var(--brass)] text-white border-[color:var(--brass)]" onClick={() => goTo(n.link)}>Open record</button>}
                    <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-transparent" onClick={() => onClear(n.id)}>Clear</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>Reminders and updates addressed to you.</div>
        {items.length > 0 && (
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-transparent" onClick={() => items.forEach((n) => onClear(n.id))}>Clear all</button>
        )}
      </div>
      {!items.length ? (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-[18px] flex items-center gap-3.5 py-[22px] px-5">
          <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-xs shrink-0 w-9 h-9 text-base" style={{ background: "var(--green-bg)", color: "var(--green)" }}>✓</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>You're all caught up</div>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>New follow-up reminders and manager-request updates will appear here.</div>
          </div>
        </div>
      ) : (
        <>
          <Group label="Today" list={today} />
          <Group label="Earlier" list={earlier} />
        </>
      )}
    </div>
  );
}