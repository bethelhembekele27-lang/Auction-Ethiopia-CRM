import { useState, useRef } from "react";
import { inputCls } from "./ui";

export default function AutoCompleteField({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);
  const filtered = (options || []).filter((o) =>
    o.toLowerCase().includes((value || "").toLowerCase())
  );

  function handleBlur() {
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  }
  function pick(o) {
    clearTimeout(blurTimer.current);
    onChange(o);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        className={inputCls}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
      />
      {open && (options || []).length > 0 && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
            background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8,
            maxHeight: 190, overflowY: "auto", boxShadow: "0 8px 20px rgba(20,23,28,0.14)",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--text-3)", fontStyle: "italic" }}>
              No matches — keep typing to add a new one
            </div>
          ) : (
            filtered.map((o) => (
              <div
                key={o}
                onMouseDown={() => pick(o)}
                style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                className="hover:bg-[color:var(--paper)]"
              >
                {o}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}