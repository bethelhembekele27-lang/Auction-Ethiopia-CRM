/* Shared visual language for a notification's kind — used on these
   floating popups AND on pages/NotificationsPage.jsx, so the two feel
   like one system rather than two different UIs. */
export const NOTIFICATION_KIND_STYLE = {
  reminder: { icon: "⏰", color: "var(--amber)", bg: "var(--amber-bg)", label: "Follow-up reminder" },
  escalation_new: { icon: "🚩", color: "var(--red)", bg: "var(--red-bg)", label: "Manager request" },
  escalation_resolved: { icon: "✓", color: "var(--green)", bg: "var(--green-bg)", label: "Resolved" },
};

export function timeAgo(ts) {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function NotificationPopups({ popupItems, popAway, goTo }) {
  if (!popupItems.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2.5 max-w-[340px] w-[calc(100vw-40px)]">
      {popupItems.map((n) => {
        const meta = NOTIFICATION_KIND_STYLE[n.kind] || NOTIFICATION_KIND_STYLE.reminder;
        return (
          <div className="bg-[color:var(--panel)] border border-[color:var(--border)] border-l-4 border-l-[color:var(--amber)] rounded-lg px-3.5 py-3 shadow-[0_8px_24px_rgba(20,23,28,0.18)]" key={n.id} style={{ borderLeftColor: meta.color }}>
            <div className="flex items-start justify-between gap-2.5 font-semibold text-[13px] mb-2">
              <span className="flex items-center gap-2 leading-[1.3]">
                <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-xs shrink-0" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
                {n.title}
              </span>
              <button className="cursor-pointer text-[color:var(--text-2)] text-xl leading-none bg-transparent border-none" onClick={() => popAway(n.id)} aria-label="Dismiss">×</button>
            </div>
            <div className="text-[12.5px] text-[color:var(--text-2)] mb-2.5 leading-[1.45] pl-8">{n.body}</div>
            <div className="flex gap-1.5 flex-wrap">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-[color:var(--brass)] text-white border-[color:var(--brass)]" onClick={() => { goTo("notifications"); popAway(n.id); }}>Go to notifications</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-transparent" onClick={() => popAway(n.id)}>Dismiss</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}