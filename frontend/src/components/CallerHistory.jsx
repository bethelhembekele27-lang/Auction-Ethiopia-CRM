import { Stamp } from "./ui";
import { STATUS_STAMP } from "../constants/lookups";
import { fmtDate } from "../utils/format";

export default function CallerHistory({ caller, excludeId }) {
  if (!caller || !caller.count) return null;
  const recent = caller.recent.filter((r) => r.id !== excludeId);
  return (
    <div className="col-span-2 bg-[color:var(--paper)] border border-[color:var(--border)] rounded-[8px] px-3 py-2.5" style={{ fontSize: 12.5 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Returning caller · {caller.count} previous inquir{caller.count === 1 ? "y" : "ies"}</div>
      {recent.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0", color: "var(--text-2)" }}>
          <b className="font-mono">{r.id}</b> {r.label} · {fmtDate(r.date)} <Stamp text={r.status} kind={STATUS_STAMP[r.status]} />
        </div>
      ))}
    </div>
  );
}
