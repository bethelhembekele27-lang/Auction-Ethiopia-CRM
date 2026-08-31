import { useState, useMemo } from "react";
import { PRIORITY_STAMP, STATUS_STAMP, APPT_STAMP } from "../constants/lookups";
import { fmtDate } from "../utils/format";
import { Stamp, Modal, EmptyState } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";

export default function Callers({ inquiries, followups, appointments }) {
  const [query, setQuery] = useState("");
  const [openPhone, setOpenPhone] = useState(null);

  // Derived entirely from live `inquiries` — no hardcoded/demo caller data
  // anywhere in this file (CHANGES §2.7 re-confirmed while rebuilding this
  // page for row-select).
  const callers = useMemo(() => {
    const m = {};
    inquiries.forEach((i) => {
      if (!m[i.phone]) m[i.phone] = { phone: i.phone, callerName: i.callerName, company: i.company, inquiries: [] };
      m[i.phone].inquiries.push(i);
    });
    return Object.values(m).sort((a, b) => b.inquiries.length - a.inquiries.length);
  }, [inquiries]);

  const filtered = callers.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return c.callerName.toLowerCase().includes(q) || c.phone.includes(q) || c.company.toLowerCase().includes(q);
  });

  const sel = useRowSelection((c) => c.phone);

  function viewSelected() {
    const rows = sel.selectedFrom(filtered);
    if (rows.length === 1) setOpenPhone(rows[0].phone);
  }

  const detail = openPhone ? callers.find((c) => c.phone === openPhone) : null;
  const detailFollowups = detail ? followups.filter((f) => detail.inquiries.some((i) => i.id === f.inquiryId)) : [];
  const detailAppointments = detail ? appointments.filter((a) => a.phone === detail.phone) : [];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input className="w-[220px] font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" placeholder="Search caller, phone or company…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
        <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={sel.selectedCount !== 1} onClick={viewSelected}>View history</button>
      </BulkActionBar>

      {filtered.length === 0 ? <EmptyState text="No callers found." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group">
                <HeaderCheckbox checked={sel.isAllSelected(filtered)} onChange={() => sel.toggleAll(filtered)} />
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Caller</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Phone</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Company</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Total inquiries</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Latest status</th>
              </tr></thead>
              <tbody>
                {filtered.map((c) => {
                  const latest = [...c.inquiries].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime))[0];
                  return (
                    <tr key={c.phone} className="group">
                      <RowCheckbox checked={sel.isSelected(c)} onChange={() => sel.toggle(c)} label={`Select ${c.callerName}`} />
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{c.callerName}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{c.phone}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{c.company || "—"}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{c.inquiries.length}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={latest.status} kind={STATUS_STAMP[latest.status]} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setOpenPhone(null)} title={detail ? `${detail.callerName} — call history` : ""} wide>
        {detail && (
          <div>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5" style={{ marginBottom: 6 }}>
              <div><div className="text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)] mb-1">Phone</div><div className="text-sm font-mono">{detail.phone}</div></div>
              <div><div className="text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)] mb-1">Company</div><div className="text-sm">{detail.company || "—"}</div></div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[color:var(--text-2)] mt-[18px] mb-2">Previous inquiries ({detail.inquiries.length})</div>
            {detail.inquiries.map((i) => (
              <div key={i.id} className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-[18px]" style={{ marginBottom: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div><b className="font-mono">{i.id}</b> · {i.category} · {fmtDate(i.dateTime.slice(0, 10))}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Stamp text={i.priority} kind={PRIORITY_STAMP[i.priority]} />
                    <Stamp text={i.status} kind={STATUS_STAMP[i.status]} />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>{i.description}</div>
              </div>
            ))}
            <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[color:var(--text-2)] mt-[18px] mb-2">Follow-up history ({detailFollowups.length})</div>
            {detailFollowups.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)" }}>None recorded.</div> : detailFollowups.map((f) => (
              <div key={f.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                {fmtDate(f.date)} — {f.notes || "No notes"} <span style={{ color: "var(--text-3)" }}>({f.status})</span>
              </div>
            ))}
            <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[color:var(--text-2)] mt-[18px] mb-2">Appointment history ({detailAppointments.length})</div>
            {detailAppointments.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)" }}>None recorded.</div> : detailAppointments.map((a) => (
              <div key={a.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                {fmtDate(a.visitDate)} {a.visitTime} — {a.auction} <Stamp text={a.status} kind={APPT_STAMP[a.status]} />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}