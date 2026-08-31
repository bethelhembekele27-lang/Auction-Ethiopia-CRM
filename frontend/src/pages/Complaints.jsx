import { useState } from "react";
import { COMPLAINT_CATEGORIES, DEPARTMENTS, PRIORITIES, PRIORITY_STAMP } from "../constants/lookups";
import { todayISO } from "../utils/format";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { complaints as complaintsApi } from "../api";

export const emptyComplaint = {
  id: "", inquiryId: "", callerName: "", phone: "", category: COMPLAINT_CATEGORIES[0],
  description: "", department: DEPARTMENTS[0], priority: "Medium", status: "Open",
  resolution: "", resolutionDate: "", date: "",
};

export default function Complaints({ complaints, setComplaints, canEdit, addAudit }) {
  const [fStatus, setFStatus] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyComplaint);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [bulkError, setBulkError] = useState("");

  const sel = useRowSelection((c) => c.id);

  const filtered = fStatus === "All" ? complaints : complaints.filter((c) => c.status === fStatus);
  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

  function openNew() { setEditing(null); setDraft({ ...emptyComplaint, date: todayISO() }); setSaveError(""); setModalOpen(true); }
  function openEdit(c) { setEditing(c.id); setDraft({ ...c }); setSaveError(""); setModalOpen(true); }
  function openEditSelected() {
    const rows = sel.selectedFrom(sorted);
    if (rows.length === 1) openEdit(rows[0]);
  }
  async function save() {
    if (!draft.callerName || !draft.description) return;
    let record = { ...draft };
    if (record.status === "Resolved" && !record.resolutionDate) record.resolutionDate = todayISO();
    setSaving(true);
    setSaveError("");
    try {
      if (editing) {
        const prev = complaints.find((c) => c.id === editing);
        const updated = await complaintsApi.updateComplaint(editing, record);
        setComplaints((prev2) => prev2.map((c) => (c.id === editing ? { ...c, ...updated } : c)));
        if (prev && prev.status !== record.status) addAudit("Update complaint status", prev.status, record.status, `${record.id} · ${record.callerName}`);
      } else {
        const created = await complaintsApi.createComplaint(record);
        setComplaints((prev2) => [created, ...prev2]);
        addAudit("Log complaint", "—", `${created.id} created`, `${created.category} — ${created.callerName}`);
      }
      setModalOpen(false);
      sel.clear();
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  // Bulk resolve — leaves the resolution text blank; use Edit on a single
  // row first if a resolution note needs to be recorded.
  async function bulkResolve() {
    const rows = sel.selectedFrom(sorted).filter((c) => c.status !== "Resolved");
    if (!rows.length) return;
    setBulkError("");
    try {
      const updates = await Promise.all(rows.map((c) => complaintsApi.updateComplaint(c.id, { status: "Resolved" })));
      setComplaints((prev) => prev.map((x) => {
        const idx = rows.findIndex((r) => r.id === x.id);
        return idx === -1 ? x : { ...x, ...updates[idx] };
      }));
      rows.forEach((c) => addAudit("Update complaint status", c.status, "Resolved", `${c.id} · ${c.callerName}`));
      sel.clear();
    } catch (err) {
      setBulkError(err.body?.message || "Couldn't resolve one or more complaints — try again.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option>All</option><option>Open</option><option>Resolved</option>
        </select>
        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" style={{ marginLeft: "auto" }} onClick={openNew}>+ New complaint</button>}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={sel.selectedCount !== 1} onClick={openEditSelected}>Edit</button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--green)] bg-[color:var(--green-bg)] text-[color:var(--green)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!sel.selectedCount} onClick={bulkResolve}>Mark Resolved</button>
        </BulkActionBar>
      )}
      {bulkError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{bulkError}</div>}

      {sorted.length === 0 ? <EmptyState text="No complaints found." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group">
                {canEdit && <HeaderCheckbox checked={sel.isAllSelected(sorted)} onChange={() => sel.toggleAll(sorted)} />}
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Caller</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Category</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Department</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Priority</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th>
              </tr></thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className="group">
                    {canEdit && <RowCheckbox checked={sel.isSelected(c)} onChange={() => sel.toggle(c)} label={`Select ${c.id}`} />}
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{c.id}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{c.callerName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c.phone}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{c.category}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{c.department}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={c.priority} kind={PRIORITY_STAMP[c.priority]} /></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={c.status} kind={c.status === "Resolved" ? "green" : "red"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing}` : "New complaint"} wide>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
          <Field label="Related inquiry ID (optional)"><input className={inputCls} value={draft.inquiryId} onChange={(e) => setDraft({ ...draft, inquiryId: e.target.value })} /></Field>
          <Field label="Caller name"><input className={inputCls} value={draft.callerName} onChange={(e) => setDraft({ ...draft, callerName: e.target.value })} /></Field>
          <Field label="Phone number"><input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
          <Field label="Category"><select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{COMPLAINT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Assigned department"><select className={inputCls} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Priority"><select className={inputCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Status"><select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option>Open</option><option>Resolved</option></select></Field>
          <Field label="Description" full><textarea className={inputCls} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field label="Resolution" full><textarea className={inputCls} rows={2} value={draft.resolution} onChange={(e) => setDraft({ ...draft, resolution: e.target.value })} /></Field>
        </div>
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Log complaint"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}