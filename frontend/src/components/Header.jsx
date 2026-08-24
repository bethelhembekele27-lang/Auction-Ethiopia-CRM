import { useState } from "react";
import { navItems } from "../constants/roles";
import { logo } from "../constants/assets";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";

export default function Header({ page, setPage, role, username, theme, setTheme, onLogout, onOpenAccountSettings, bellItems, onGoToNotification }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const goTo = (key) => {
    setPage(key);
    setMobileNavOpen(false);
  };

  const visibleNavItems = navItems.filter((n) => !n.hidden && (!n.roles || n.roles.includes(role)));

  return (
    <div className="w-full bg-[color:var(--panel)] border-b border-[color:var(--border)] text-[color:var(--text)] shrink-0 flex items-center justify-between flex-wrap gap-y-3 gap-x-6 px-7 py-3.5 sticky top-0 z-50 mobile:px-4 mobile:py-3">
      <div className="flex flex-col items-start gap-1">
        <img src={logo} alt="Auction Ethiopia S.C." className="h-[34px] w-auto block" />
        <div className="text-[11px] text-[color:var(--text-2)] tracking-[0.03em] uppercase whitespace-nowrap xs:hidden">CRM &amp; Call Center</div>
      </div>
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex flex-row flex-wrap items-center gap-1 mobile:hidden">
          {visibleNavItems.map((n) => (
            <div
              key={n.key}
              className={
                "flex items-center px-3.5 py-2 rounded-[5px] text-sm font-medium cursor-pointer border-b-2 transition-colors duration-[120ms] hover:bg-[color:var(--paper)] hover:text-[color:var(--text)] " +
                (page === n.key
                  ? "text-[color:var(--brass)] border-b-[color:var(--brass)]"
                  : "text-[color:var(--text-2)] border-transparent")
              }
              onClick={() => goTo(n.key)}
            >
              {n.label}
            </div>
          ))}
        </div>
        <button
          className="hidden items-center justify-center w-9 h-9 border border-[color:var(--border)] rounded-md bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer shrink-0 mobile:flex dark:bg-[#1A1A1A]"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={mobileNavOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <NotificationBell items={bellItems} onGoTo={(link) => { onGoToNotification(link); setMobileNavOpen(false); }} />
        <ProfileMenu username={username} role={role} theme={theme} setTheme={setTheme} onLogout={onLogout} onOpenAccountSettings={onOpenAccountSettings} />
      </div>
      {mobileNavOpen && (
        <>
          <div className="fixed inset-0 bg-black/25 z-[59]" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute top-full inset-x-0 bg-[color:var(--panel)] border-b border-[color:var(--border)] shadow-[0_8px_16px_rgba(0,0,0,0.12)] flex flex-col p-2 gap-0.5 z-[60]">
            {visibleNavItems.map((n) => (
              <div
                key={n.key}
                className={
                  "flex items-center px-3.5 py-2 rounded-[5px] text-sm font-medium cursor-pointer hover:bg-[color:var(--paper)] hover:text-[color:var(--text)] " +
                  (page === n.key ? "text-[color:var(--brass)] bg-[color:var(--paper)]" : "text-[color:var(--text-2)]")
                }
                onClick={() => goTo(n.key)}
              >
                {n.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}