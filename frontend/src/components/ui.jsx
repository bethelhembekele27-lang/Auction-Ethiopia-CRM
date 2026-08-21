/* ================================================================
   SMALL SHARED UI ATOMS — Stamp, StatCard, Field, Modal, EmptyState,
   DonutChart. Also exports `inputCls`, the shared input class string
   the page forms use, since it lives right alongside Field here in
   the original file.
================================================================= */
const STAMP_KIND_CLASSES = {
  green: "text-[color:var(--green)] bg-[color:var(--green-bg)]",
  amber: "text-[color:var(--amber)] bg-[color:var(--amber-bg)]",
  red: "text-[color:var(--red)] bg-[color:var(--red-bg)]",
  blue: "text-[color:var(--blue)] bg-[color:var(--blue-bg)]",
  brass: "text-[color:var(--brass-dark)] bg-[color:var(--brass-bg)]",
  gray: "text-[color:var(--gray)] bg-[color:var(--gray-bg)]",
};
const STAMP_BASE_CLASSES = "inline-block font-mono font-semibold text-[10.5px] tracking-[0.06em] uppercase px-[9px] py-[3px] rounded-[3px] border-[1.5px] border-current whitespace-nowrap my-0.5 dark:bg-white/[0.08]";
export function Stamp({ text, kind }) {
  return <span className={`${STAMP_BASE_CLASSES} ${STAMP_KIND_CLASSES[kind] || STAMP_KIND_CLASSES.gray}`}>{text}</span>;
}

const STAT_TONE_CLASSES = { up: "text-[color:var(--green)]", warn: "text-[color:var(--amber)]" };
export function StatCard({ label, value, foot, tone }) {
  return (
    <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-[18px]">
      <div className="text-xs text-[color:var(--text-2)] uppercase tracking-[0.04em]">{label}</div>
      <div className={`font-mono text-[26px] font-semibold mt-2 ${STAT_TONE_CLASSES[tone] || ""}`}>{value}</div>
      {foot && <div className="text-xs text-[color:var(--text-3)] mt-1.5">{foot}</div>}
    </div>
  );
}

export function Field({ label, children, full }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="block mb-1 text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)]">{label}</span>
      {children}
    </label>
  );
}
export const inputCls = "w-full font-sans text-[13.5px] px-2.5 py-[9px] border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)] dark:bg-[#1A1A1A]";

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[rgba(20,23,28,0.45)] flex items-center justify-center z-50 p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl w-full max-h-[90vh] overflow-y-auto p-0 dark:bg-[color:var(--panel)] dark:text-[color:var(--text)]" style={{ maxWidth: wide ? 760 : 520 }}>
        <div className="px-6 py-5 border-b border-[color:var(--border)] flex justify-between items-start sticky top-0 bg-[color:var(--panel)]">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="cursor-pointer text-[color:var(--text-2)] text-xl leading-none bg-transparent border-none" onClick={onClose}>&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ text }) {
  return <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-3)", padding: "40px 0", border: "1px dashed var(--border)", borderRadius: 10 }}>{text}</div>;
}

export function DonutChart({ data, colorMap, size = 150, donut }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let cum = 0;
  const palette = ["--brass", "--green", "--blue", "--amber", "--red", "--gray"];
  const stops = data.map((d, i) => {
    const start = (cum / total) * 100;
    cum += d.value;
    const end = (cum / total) * 100;
    const color = `var(${palette[i % palette.length]})`;
    return { color, start, end };
  });
  const bg = data.length ? `conic-gradient(${stops.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ")})` : "var(--gray-bg)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: bg }} />
        {donut && <div style={{ position: "absolute", inset: 0, margin: "auto", width: size * 0.55, height: size * 0.55, borderRadius: "50%", background: "var(--panel)" }} />}
      </div>
      <div style={{ fontSize: 12.5 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: `var(${palette[i % palette.length]})`, flexShrink: 0 }} />
            <span style={{ color: "var(--text-2)" }}>{d.name}</span>
            <span style={{ color: "var(--text-3)" }}>({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}