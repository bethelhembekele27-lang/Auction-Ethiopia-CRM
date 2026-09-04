import { useState, useMemo } from "react";
import { todayISO, fmtDate, isIsoDate } from "../utils/format";
import { Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { visitSetups as visitSetupsApi } from "../api";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";
import { EditIcon, DeleteIcon, PlusIcon } from "../components/icons";

const emptyVisitSetup = {
  id: "", company: "", batch: "", dateFrom: "", dateTo: "", address: "", items: "",
  guideName: "", guidePhone: "", guideTimeFrom: "", guideTimeTo: "",
};

// Exported so Visitations.jsx (and any other page) can reuse the exact
// same open/closed and display logic instead of keeping a second copy
// that could drift out of sync — see CHANGES.md item 1.
export function formatSetupDateRange(v) {
  const fromDisplay = v.dateFrom ? (isIsoDate(v.dateFrom) ? fmtDate(v.dateFrom) : v.dateFrom) : "";
  const toDisplay = v.dateTo ? (isIsoDate(v.dateTo) ? fmtDate(v.dateTo) : v.dateTo) : "";
  if (!fromDisplay && !toDisplay) return "—";
  if (fromDisplay && toDisplay) return fromDisplay === toDisplay ? fromDisplay : `${fromDisplay} – ${toDisplay}`;
  return fromDisplay || toDisplay;
}

export function isSetupOpen(v) {
  const checkDate = v.dateTo || v.dateFrom;
  if (!checkDate || !isIsoDate(checkDate)) return true;
  return checkDate >= todayISO();
}

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

function DateRangeField({ label, value, mode, setMode, onChange }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <button type="button" className={"font-sans text-[13px] font-medium rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" + (mode === "calendar" ? " bg-[color:var(--brass)] text-white border-[color:var(--brass)]" : "")} onClick={() => { setMode("calendar"); onChange(isIsoDate(value) ? value : ""); }}>Pick from calendar</button>
        <button type="button" className={"font-sans text-[13px] font-medium rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" + (mode === "manual" ? " bg-[color:var(--brass)] text-white border-[color:var(--brass)]" : "")} onClick={() => { setMode("manual"); onChange(isIsoDate(value) ? "" : value); }}>Write manually</button>
      </div>
      {mode === "calendar"
        ? <input type="date" className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className={inputCls} placeholder="e.g. mid August 2026, or every Saturday" value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export default function VisitSetups({ visitSetups, setVisitSetups, genId, canEdit, addAudit, session }) {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyVisitSetup);
  const [dateFromMode, setDateFromMode] = useState("calendar");
  const [dateToMode, setDateToMode] = useState("calendar");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const sel = useRowSelection((v) => v.id);
  const { pending, confirm, cancel, run } = useConfirm();
  async function bulkDelete() {
    const rows = sel.selectedFrom(filtered);
    if (!rows.length) return;
    confirm(`Permanently delete ${rows.length} visit setup(s)? This cannot be undone.`, async () => {
      setSaveError("");
      try {
        await Promise.all(rows.map((v) => visitSetupsApi.deleteVisitSetup(v.id)));
        setVisitSetups((prev) => prev.filter((v) => !rows.some((r) => r.id === v.id)));
        rows.forEach((v) => addAudit("Delete visit setup", `${v.id} · ${v.company}`, "—", "Permanently removed"));
        sel.clear();
      } catch (err) {
        setSaveError(err.body?.message || "Couldn't delete one or more visit setups — try again.");
      }
    });
  }

  const filtered = useMemo(() => {
    if (!query) return visitSetups;
    const q = query.toLowerCase();
    return visitSetups.filter((v) =>
      v.company.toLowerCase().includes(q) || v.batch.toLowerCase().includes(q) ||
      v.guideName.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)
    );
  }, [visitSetups, query]);

  function openNew() {
    setEditing(null);
    setDraft(emptyVisitSetup);
    setDateFromMode("calendar");
    setDateToMode("calendar");
    setSaveError("");
    setModalOpen(true);
  }
  function openEdit(v) {
    setEditing(v.id);
    setDraft({ ...v });
    setDateFromMode(isIsoDate(v.dateFrom) || !v.dateFrom ? "calendar" : "manual");
    setDateToMode(isIsoDate(v.dateTo) || !v.dateTo ? "calendar" : "manual");
    setSaveError("");
    setModalOpen(true);
  }
  function openEditSelected() {
    const rows = sel.selectedFrom(filtered);
    if (rows.length === 1) openEdit(rows[0]);
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
      sel.clear();
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
        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)] btn-icon-label" style={{ marginLeft: "auto" }} onClick={openNew}>
          <PlusIcon /><span>New visit setup</span>
        </button>}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={sel.selectedCount !== 1} onClick={openEditSelected}>
            <EditIcon /><span>Edit</span>
          </button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] btn-danger-outline cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={bulkDelete}>
            <DeleteIcon /><span>Delete</span>
          </button>
        </BulkActionBar>
      )}
      {filtered.length === 0 ? <EmptyState text="No visit setups registered yet." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group">
                {canEdit && <HeaderCheckbox checked={sel.isAllSelected(filtered)} onChange={() => sel.toggleAll(filtered)} />}
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Company</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Batch</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Date range</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Address</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Items</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Guide</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Daily hours</th>
              </tr></thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="group">
                    {canEdit && <RowCheckbox checked={sel.isSelected(v)} onChange={() => sel.toggle(v)} label={`Select ${v.id}`} />}
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{v.id}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.company}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.batch}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{formatSetupDateRange(v)}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.address}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.items}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.guideName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{v.guidePhone}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{v.guideTimeFrom} – {v.guideTimeTo}</td>
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
          <DateRangeField label="Date from" value={draft.dateFrom} mode={dateFromMode} setMode={setDateFromMode} onChange={(v) => setDraft((d) => ({ ...d, dateFrom: v }))} />
          <DateRangeField label="Date to" value={draft.dateTo} mode={dateToMode} setMode={setDateToMode} onChange={(v) => setDraft((d) => ({ ...d, dateTo: v }))} />
        </div>
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Create visit setup"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>
      <ConfirmDialog pending={pending} onCancel={cancel} onConfirm={run} />
    </div>
  );
}