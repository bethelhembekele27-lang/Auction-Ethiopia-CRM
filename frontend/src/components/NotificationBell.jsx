export function NotificationBell({ items, onGoTo }) {
  const count = items.length;

  return (
    <button
      className="w-[34px] h-[34px] rounded-full border-none bg-[color:var(--brass)] text-white font-display font-semibold text-sm flex items-center justify-center cursor-pointer shrink-0 hover:bg-[color:var(--brass-dark)]"
      style={{ background: count ? "var(--brass)" : "var(--gray)", position: "relative" }}
      onClick={() => onGoTo("notifications")}
      aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
      title="Notifications"
    >
      🔔
      {count > 0 && <span className="absolute -top-[3px] -right-[3px] min-w-[16px] h-[16px] px-[3px] rounded-lg bg-[color:var(--red)] text-white text-[9.5px] font-bold flex items-center justify-center leading-none border-2 border-[color:var(--panel)]">{count > 9 ? "9+" : count}</span>}
    </button>
  );
}