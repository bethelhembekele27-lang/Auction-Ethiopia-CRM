import { useState } from "react";
import { roleLabels } from "../constants/roles";

export function ProfileMenu({ username, role, theme, setTheme, onLogout, onOpenAccountSettings }) {
  const [open, setOpen] = useState(false);
  const initial = (username || "?").charAt(0).toUpperCase();

  return (
    <div style={{ position: "relative" }}>
      <button className="w-[34px] h-[34px] rounded-full border-none bg-[color:var(--brass)] text-white font-display font-semibold text-sm flex items-center justify-center cursor-pointer shrink-0 hover:bg-[color:var(--brass-dark)]" onClick={() => setOpen((v) => !v)} aria-label="Account menu" title={`${username} · ${roleLabels[role]}`}>
        {initial}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpen(false)} />
          <div className="absolute top-[calc(100%+10px)] right-0 w-[230px] bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] shadow-[0_8px_24px_rgba(20,23,28,0.14)] z-[41] p-3.5">
            <div className="flex items-center gap-2.5 pb-3 mb-2.5 border-b border-[color:var(--border)]">
              <div className="w-[34px] h-[34px] rounded-full border-none bg-[color:var(--brass)] text-white font-display font-semibold text-sm flex items-center justify-center cursor-pointer shrink-0 hover:bg-[color:var(--brass-dark)] w-10 h-10 text-base cursor-default">{initial}</div>
              <div>
                <div className="text-[13.5px] font-semibold">{username}</div>
                <div className="text-[11.5px] text-[color:var(--text-2)]">{roleLabels[role]}</div>
              </div>
            </div>

            <div className="mb-2.5">
              <div className="text-[10.5px] text-[color:var(--text-3)] uppercase tracking-[0.04em] mb-1.5">Appearance</div>
              <button
                className="flex items-center gap-2 w-full border border-[color:var(--border)] rounded-md bg-[color:var(--panel)] text-[color:var(--text)] font-sans text-[12.5px] px-2.5 py-2 cursor-pointer hover:border-[color:var(--text-3)] dark:bg-[#1A1A1A]"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {theme === "light" ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                )}
                <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
              </button>
            </div>

            <button className="block w-full text-left bg-transparent border-none font-sans text-[13px] px-1.5 py-2 rounded-md cursor-pointer text-[color:var(--text)] hover:bg-[color:var(--paper)]" onClick={() => { setOpen(false); onOpenAccountSettings(); }}>Edit profile</button>
            <button className="block w-full text-left bg-transparent border-none font-sans text-[13px] px-1.5 py-2 rounded-md cursor-pointer text-[color:var(--text)] hover:bg-[color:var(--paper)]" onClick={onLogout}>Log out</button>
          </div>
        </>
      )}
    </div>
  );
}