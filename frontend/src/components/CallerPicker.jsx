import { useState, useRef } from "react";
import { inputCls } from "./ui";

// mode "phone" or "name". onPick(callerRecord) fires when a suggestion is chosen.
export default function CallerPicker({ mode, value, onChange, onPick, callers, placeholder }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const q = (value || "").toLowerCase().trim();
  const matches = callers
    .filter((c) => (mode === "phone" ? c.phone.includes(q) : (c.name || "").toLowerCase().includes(q)))
    .filter((c) => (mode === "name" ? c.name : true))
    .slice(0, 6);

  return (
    <div style={{ position: "relative" }}>
      <input className={inputCls} value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { timer.current = setTimeout(() => setOpen(false), 150); }} />
      {open && q.length > 0 && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 20px rgba(20,23,28,0.14)" }}>
          {matches.map((c) => (
            <div key={c.phone} className="hover:bg-[color:var(--paper)]" style={{ padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10 }}
              onMouseDown={() => { clearTimeout(timer.current); onPick(c); setOpen(false); }}>
              <span>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name || "Unknown caller"}</div>
                <div className="font-mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c.phone}{c.company ? ` · ${c.company}` : ""}</div>
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{c.count} inquir{c.count === 1 ? "y" : "ies"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
