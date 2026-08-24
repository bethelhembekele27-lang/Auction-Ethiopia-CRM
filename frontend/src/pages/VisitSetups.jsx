import { useState, useMemo } from "react";
import { DAYS_OF_WEEK } from "../constants/lookups";
import { todayISO, fmtDate, isIsoDate } from "../utils/format";
import { Field, Modal, EmptyState, inputCls } from "../components/ui";
import { visitSetups as visitSetupsApi } from "../api";

const emptyVisitSetup = {
  id: "", company: "", batch: "", date: "", address: "", items: "",
  guideName: "", guidePhone: "", guideDays: [], guideTimeFrom: "", guideTimeTo: "",
};

export function autoFollowupForVisit(visit, genId, operatorName) {
  const base = new Date((visit.visitDate || todayISO()) + "T00:00:00");
  const next = isNaN(base) ? new Date() : new Date(base.getTime() + 86400000);
  return {
    id: genId("FU", "fu"),
    inquiryId: visit.id,
    callerName: visit.visitorName,
    date: next.toISOString().slice(0, 10),
    reminder: true,
    assignedOperator: operatorName || "",
    status: "Pending",
    notes: `Follow up after the visit — ask ${visit.visitorName} what they thought of the items (${visit.batch || visit.auction || "—"}).`,
    createdDate: todayISO(),
    company: visit.company || "",
    batch: visit.batch || "",
    guideName: visit.guideName || visit.assignedStaff || "",
  };
}

export default function VisitSetups({ visitSetups, setVisitSetups, genId, canEdit, addAudit, session }) {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyVisitSetup);
  const [dateMode, setDateMode] = useState("calendar");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const filtered = useMemo(() => {
    if (!query) return visitSetups;
    const q = query.toLowerCase();
    return visitSetups.filter((v) =>
      v.company.toLowerCase().includes(q) || v.batch.toLowerCase().includes(q) ||
      v.guideName.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)
    );
  }, [visitSetups, query]);

  function openNew() { setEditing(null); setDraft(emptyVisitSetup); setDateMode("calendar"); setSaveError(""); setModalOpen(true); }
  function openEdit(v) { setEditing(v.id); setDraft({ ...v }); setDateMode(isIsoDate(v.date) || !v.date ? "calendar" : "manual"); setSaveError(""); setModalOpen(true); }
  function toggleDay(day) {
    setDraft((d) => ({ ...d, guideDays: d.guideDays.includes(day) ? d.guideDays.filter((x) => x !== day) : [...d.guideDays, day] }));
  }
  async function save() {
    if (!draft.company || !draft.batch || !draft.guideName || !draft.guidePhone) return;
    setSaving(true);
    setSaveError("");
    try {
      if (editing) {
        const updated = await visitSetupsApi.updateVisitSetup(editing, draft);
        setVisitSetups((prev) => prev.map((v) => (v.id === editing ? { ...v, ...updated } : v)));
        addAudit("Edit visit setup", "—", editing, `${draft.company} · ${draft.batch}`);
      } else {
        const created = await visitSetupsApi.createVisitSetup(draft);
        setVisitSetups((prev) => [created, ...prev]);
        addAudit("Create visit setup", "—", `${created.id} created`, `${created.company} · ${created.batch} — guide ${created.guideName}`);
      }
      setModalOpen(false);
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input className="w-[220px] font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" placeholder="Search company, batch, guide…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" style={{ marginLeft: "auto" }} onClick={openNew}>+ New visit setup</button>}
      </div>
      {filtered.length === 0 ? <EmptyState text="No visit setups registered yet." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group"><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Company</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Batch</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Date</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Address</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Items</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Guide</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Availability</th>{canEdit && <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Actions</th>}</tr></thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="group">
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{v.id}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.company}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.batch}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{isIsoDate(v.date) ? fmtDate(v.date) : (v.date || "—")}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.address}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.items}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.guideName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{v.guidePhone}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.guideDays.join(", ")}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{v.guideTimeFrom} – {v.guideTimeTo}</div></td>
                    {canEdit && <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" onClick={() => openEdit(v)}>Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing}` : "New visit setup"} wide>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
          <Field label="Company"><input className={inputCls} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></Field>
          <Field label="Batch number"><input className={inputCls} value={draft.batch} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} /></Field>
          <Field label="Address"><input className={inputCls} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
          <Field label="Item(s) out for auction" full><textarea className={inputCls} rows={2} value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} /></Field>
          <Field label="Guide name"><input className={inputCls} value={draft.guideName} onChange={(e) => setDraft({ ...draft, guideName: e.target.value })} /></Field>
          <Field label="Guide phone"><input className={inputCls} value={draft.guidePhone} onChange={(e) => setDraft({ ...draft, guidePhone: e.target.value })} /></Field>
          <Field label="Available from"><input type="time" className={inputCls} value={draft.guideTimeFrom} onChange={(e) => setDraft({ ...draft, guideTimeFrom: e.target.value })} /></Field>
          <Field label="Available until"><input type="time" className={inputCls} value={draft.guideTimeTo} onChange={(e) => setDraft({ ...draft, guideTimeTo: e.target.value })} /></Field>
          <Field label="Date" full>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button type="button" className={"font-sans text-[13px] font-medium rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" + (dateMode === "calendar" ? " bg-[color:var(--brass)] text-white border-[color:var(--brass)]" : "")} onClick={() => { setDateMode("calendar"); setDraft((d) => ({ ...d, date: isIsoDate(d.date) ? d.date : "" })); }}>Pick from calendar</button>
              <button type="button" className={"font-sans text-[13px] font-medium rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" + (dateMode === "manual" ? " bg-[color:var(--brass)] text-white border-[color:var(--brass)]" : "")} onClick={() => { setDateMode("manual"); setDraft((d) => ({ ...d, date: isIsoDate(d.date) ? "" : d.date })); }}>Write manually</button>
            </div>
            {dateMode === "calendar"
              ? <input type="date" className={inputCls} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              : <input className={inputCls} placeholder="e.g. mid August 2026, or every Saturday" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />}
          </Field>
          <Field label="Available days" full>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DAYS_OF_WEEK.map((day) => (
                <button type="button" key={day} className={"font-sans text-[13px] font-medium rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" + (draft.guideDays.includes(day) ? " bg-[color:var(--brass)] text-white border-[color:var(--brass)]" : "")} onClick={() => toggleDay(day)}>{day}</button>
              ))}
            </div>
          </Field>
        </div>
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Create visit setup"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}