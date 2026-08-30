import { useState, useMemo } from "react";
import { AUCTIONS, PRIORITIES, STATUSES, APPT_STATUSES } from "../constants/lookups";
import { todayISO, fmtDate } from "../utils/format";
import { exportRowsCSV, exportRowsPDF } from "../utils/export";
import { Field, EmptyState, inputCls } from "../components/ui";

const REPORT_TYPES = [
  { key: "all", label: "All" },
  { key: "inquiries", label: "Caller inquiries" },
  { key: "visitations", label: "Visitations" },
  { key: "complaints", label: "Complaints" },
];
const COMPLAINT_STATUSES = ["Open", "Resolved"];

export function CustomReportBuilder({ inquiries, appointments, complaints }) {
  const companyOptions = useMemo(() => {
    const set = new Set(inquiries.map((i) => i.company || "Auction Ethiopia (general)"));
    return ["Any company", ...Array.from(set).sort()];
  }, [inquiries]);

  const [rType, setRType] = useState("inquiries");
  const [rCompany, setRCompany] = useState("Any company");
  const [rAuction, setRAuction] = useState("Any auction");
  const [rBatch, setRBatch] = useState("");
  const [rPriority, setRPriority] = useState("Any priority");
  const [rSubType, setRSubType] = useState("all");
  const [rFrom, setRFrom] = useState("");
  const [rTo, setRTo] = useState("");
  const [rStatuses, setRStatuses] = useState([]);
  const [previewRows, setPreviewRows] = useState(null);

  const usesAuctionFields = rType !== "complaints";
  const usesPriorityField = rType !== "visitations";
  const statusChoices = rType === "visitations" ? APPT_STATUSES
    : rType === "complaints" ? COMPLAINT_STATUSES
    : rType === "all"
      ? (rSubType === "inquiries" ? STATUSES
        : rSubType === "visitations" ? APPT_STATUSES
        : rSubType === "complaints" ? COMPLAINT_STATUSES
        : Array.from(new Set([...STATUSES, ...APPT_STATUSES, ...COMPLAINT_STATUSES])))
    : STATUSES;

  function toggleStatus(s) {
    setRStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  // Date filtering is now purely Date-from / Date-to (CHANGES.md item 7)
  // — if both are left blank, every matching record is included
  // regardless of date, rather than silently defaulting to "Today".
  function passesCommonFilters(r, dateOnly) {
    if (rFrom && dateOnly < rFrom) return false;
    if (rTo && dateOnly > rTo) return false;
    if (rStatuses.length && !rStatuses.includes(r.status)) return false;
    if (rPriority !== "Any priority" && r.priority !== rPriority) return false;
    return true;
  }

  function passesAuctionFilters(r) {
    if (rCompany !== "Any company" && (r.company || "Auction Ethiopia (general)") !== rCompany) return false;
    if (rAuction !== "Any auction" && r.auction !== rAuction) return false;
    if (rBatch && !(r.batch || "").toLowerCase().includes(rBatch.toLowerCase())) return false;
    return true;
  }

  function buildRows() {
    if (rType === "all") {
      const rows = [];
      const wantsAuctionSpecifics = rCompany !== "Any company" || rAuction !== "Any auction" || !!rBatch;
      if (rSubType === "all" || rSubType === "inquiries") {
        inquiries.forEach((r) => {
          const dateOnly = (r.dateTime || "").slice(0, 10);
          if (passesCommonFilters(r, dateOnly) && passesAuctionFilters(r)) {
            rows.push({ Type: "Inquiry", ID: r.id, Name: r.callerName, Phone: r.phone, Company: r.company || "Auction Ethiopia (general)", Auction: r.auction, Category: r.category, Priority: r.priority, Date: fmtDate(dateOnly), Status: r.status });
          }
        });
      }
      if (rSubType === "all" || rSubType === "visitations") {
        appointments.forEach((r) => {
          const dateOnly = r.visitDate || "";
          if (passesCommonFilters(r, dateOnly) && passesAuctionFilters(r)) {
            rows.push({ Type: "Visitation", ID: r.id, Name: r.visitorName, Phone: r.phone, Company: r.company || "Auction Ethiopia (general)", Auction: r.auction, Category: "—", Priority: "—", Date: fmtDate(dateOnly), Status: r.status });
          }
        });
      }
      if ((rSubType === "all" || rSubType === "complaints") && !wantsAuctionSpecifics) {
        complaints.forEach((r) => {
          const dateOnly = r.date || "";
          if (passesCommonFilters(r, dateOnly)) {
            rows.push({ Type: "Complaint", ID: r.id, Name: r.callerName, Phone: r.phone, Company: "—", Auction: "—", Category: r.category, Priority: r.priority, Date: fmtDate(dateOnly), Status: r.status });
          }
        });
      }
      return rows;
    }
    const source = rType === "visitations" ? appointments : rType === "complaints" ? complaints : inquiries;
    const rows = source.filter((r) => {
      const rawDate = rType === "visitations" ? r.visitDate : rType === "complaints" ? r.date : (r.dateTime || "").slice(0, 10);
      const dateOnly = (rawDate || "").slice(0, 10);
      if (!passesCommonFilters(r, dateOnly)) return false;
      if (usesAuctionFields && !passesAuctionFilters(r)) return false;
      return true;
    });
    return rows.map((r) => {
      if (rType === "visitations") {
        return { "Appointment ID": r.id, Visitor: r.visitorName, Phone: r.phone, Company: r.company || "Auction Ethiopia (general)", Auction: r.auction, Batch: r.batch || "—", "Visit date": fmtDate(r.visitDate), Time: r.visitTime, Staff: r.assignedStaff, Status: r.status };
      }
      if (rType === "complaints") {
        return { "Complaint ID": r.id, Caller: r.callerName, Phone: r.phone, Category: r.category, Department: r.department, Priority: r.priority, Date: fmtDate(r.date), Status: r.status };
      }
      return { "Inquiry ID": r.id, Caller: r.callerName, Phone: r.phone, Company: r.company || "Auction Ethiopia (general)", Auction: r.auction, Batch: r.batch || "—", Category: r.category, Priority: r.priority, Operator: r.operator, Date: fmtDate((r.dateTime || "").slice(0, 10)), Status: r.status };
    });
  }

  function preview() { setPreviewRows(buildRows()); }
  const reportTitle = (rType === "all" ? "All records" : REPORT_TYPES.find((t) => t.key === rType)?.label) + " report";

  return (
    <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-[18px]" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 4px" }}>Build a custom report</h3>
      <div style={{ marginBottom: 10 }} />
      <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
        <Field label="Report type">
          <select className={inputCls} value={rType} onChange={(e) => { const v = e.target.value; setRType(v); setPreviewRows(null); setRStatuses([]); if (v === "visitations") setRPriority("Any priority"); if (v !== "all") setRSubType("all"); }}>
            {REPORT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Date from (optional)"><input type="date" className={inputCls} value={rFrom} onChange={(e) => setRFrom(e.target.value)} /></Field>
        {usesAuctionFields && (
          <Field label="Company / client (optional)">
            <select className={inputCls} value={rCompany} onChange={(e) => setRCompany(e.target.value)}>
              {companyOptions.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        )}
        <Field label="Date to (optional)"><input type="date" className={inputCls} value={rTo} onChange={(e) => setRTo(e.target.value)} /></Field>
        {usesAuctionFields && (
          <Field label="Auction (optional)">
            <select className={inputCls} value={rAuction} onChange={(e) => setRAuction(e.target.value)}>
              <option>Any auction</option>{AUCTIONS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
        )}
        {usesAuctionFields && (
          <Field label="Batch (optional)">
            <input className={inputCls} placeholder="e.g. Batch 2" value={rBatch} onChange={(e) => setRBatch(e.target.value)} />
          </Field>
        )}
        {usesPriorityField && (
          <Field label="Priority (optional)">
            <select className={inputCls} value={rPriority} onChange={(e) => setRPriority(e.target.value)}>
              <option>Any priority</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        )}
      </div>
      {rType === "all" && (
        <div style={{ marginBottom: 14, maxWidth: 260 }}>
          <div className="text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)]" style={{ marginBottom: 6 }}>Record type (optional)</div>
          <select
            className={inputCls}
            value={rSubType}
            onChange={(e) => { setRSubType(e.target.value); setRStatuses([]); }}
          >
            <option value="all">All (inquiries, visitations &amp; complaints)</option>
            <option value="inquiries">Inquiries only</option>
            <option value="visitations">Visitations only</option>
            <option value="complaints">Complaints only</option>
          </select>
        </div>
      )}
      <div className="col-span-2" style={{ marginBottom: 14 }}>
        <div className="text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)]" style={{ marginBottom: 6 }}>Status (optional — pick as many as you like)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
          {statusChoices.map((s) => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={rStatuses.includes(s)} onChange={() => toggleStatus(s)} /> {s}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--ink)] text-white border-[color:var(--ink)]" onClick={preview}>Preview report</button>
        <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" disabled={!previewRows || !previewRows.length} onClick={() => exportRowsCSV(rType + "-report-" + todayISO(), previewRows)}>Export Excel (CSV)</button>
        <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" disabled={!previewRows || !previewRows.length} onClick={() => exportRowsPDF(reportTitle, previewRows)}>Export PDF</button>
      </div>

      {previewRows && (
        previewRows.length === 0 ? <div style={{ marginTop: 14 }}><EmptyState text="No records match these filters." /></div> : (
          <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden" style={{ marginTop: 14 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="w-full border-collapse text-[13px] min-w-[640px]">
                <thead><tr className="group">{Object.keys(previewRows[0]).map((h) => <th key={h} className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">{h}</th>)}</tr></thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={idx} className="group">{Object.keys(previewRows[0]).map((h) => <td key={h} className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{r[h]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default function Reports({ inquiries, appointments, complaints }) {
  return (
    <div>
      <CustomReportBuilder inquiries={inquiries} appointments={appointments} complaints={complaints} />
    </div>
  );
}