import { useState, useMemo } from "react";
import { APPT_STATUSES, APPT_STAMP } from "../constants/lookups";
import { todayISO, fmtDate, isIsoDate, dateInPreset } from "../utils/format";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { isSetupOpen } from "./VisitSetups";
import { appointments as appointmentsApi, followups as followupsApi } from "../api";

export const emptyAppt = {
  id: "", auction: "", visitorName: "", phone: "", company: "",
  visitDate: "", visitTime: "", assignedStaff: "", status: "Requested", notes: "",
  setupId: "", batch: "", guideName: "", guidePhone: "", address: "", items: "",
};

const WHEN_PRESETS = [
  { key: "all", label: "Any day" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

export default function Visitations({ appointments, setAppointments, visitSetups, setFollowups, canEdit, addAudit, session }) {
  const [when, setWhen] = useState("all");
  const [pickDate, setPickDate] = useState("");
  const [fCompany, setFCompany] = useState("All");
  const [fBatch, setFBatch] = useState("All");
  const [fGuide, setFGuide] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyAppt);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [bulkError, setBulkError] = useState("");

  const sel = useRowSelection((a) => a.id);

  const companyOptions = useMemo(() => [...new Set(visitSetups.map((v) => v.company))], [visitSetups]);
  const batchOptions = useMemo(
    () => [...new Set(visitSetups.filter((v) => fCompany === "All" || v.company === fCompany).map((v) => v.batch))],
    [visitSetups, fCompany]
  );
  const guideOptions = useMemo(() => [...new Set(visitSetups.map((v) => v.guideName))], [visitSetups]);

  const openVisitSetups = useMemo(() => visitSetups.filter(isSetupOpen), [visitSetups]);
  const setupOptions = useMemo(() => {
    if (draft.setupId && !openVisitSetups.some((v) => v.id === draft.setupId)) {
      const current = visitSetups.find((v) => v.id === draft.setupId);
      if (current) return [...openVisitSetups, current];
    }
    return openVisitSetups;
  }, [openVisitSetups, visitSetups, draft.setupId]);

  const filtered = appointments.filter((a) => {
    if (pickDate) { if (a.visitDate !== pickDate) return false; }
    else if (when !== "all" && !dateInPreset(a.visitDate, when)) return false;
    if (fCompany !== "All" && a.company !== fCompany) return false;
    if (fBatch !== "All" && a.batch !== fBatch) return false;
    if (fGuide !== "All" && a.guideName !== fGuide) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));
  function clearWhen() { setWhen("all"); setPickDate(""); }

  function openNew() { setEditing(null); setDraft(emptyAppt); setSaveError(""); setModalOpen(true); }
  function openEdit(a) { setEditing(a.id); setDraft({ ...a }); setSaveError(""); setModalOpen(true); }
  function openEditSelected() {
    const rows = sel.selectedFrom(sorted);
    if (rows.length === 1) openEdit(rows[0]);
  }

  function applySetup(setupId) {
    const s = visitSetups.find((v) => v.id === setupId);
    if (!s) { setDraft((d) => ({ ...d, setupId: "" })); return; }
    setDraft((d) => ({
      ...d, setupId: s.id, company: s.company, batch: s.batch,
      guideName: s.guideName, guidePhone: s.guidePhone, address: s.address, items: s.items,
      assignedStaff: s.guideName,
    }));
  }
  const selectedSetup = visitSetups.find((v) => v.id === draft.setupId);

  async function save() {
    if (!draft.visitorName || !draft.phone || !draft.visitDate) return;
    setSaving(true);
    setSaveError("");
    try {
      if (editing) {
        const prev = appointments.find((a) => a.id === editing);
        const updated = await appointmentsApi.updateAppointment(editing, draft);
        setAppointments((prev2) => prev2.map((a) => (a.id === editing ? { ...a, ...updated } : a)));
        if (prev && prev.status !== draft.status) addAudit("Update visitation status", prev.status, draft.status, `${draft.id} · ${draft.visitorName}`);
      } else {
        const created = await appointmentsApi.createAppointment(draft);
        setAppointments((prev2) => [created, ...prev2]);
        addAudit("Register visitor", "—", `${created.id} created`, `${created.visitorName} · ${created.company} · ${created.batch}`);
        try {
          const refreshed = await followupsApi.listFollowups();
          setFollowups(refreshed || []);
        } catch { /* non-fatal — follow-up list just won't refresh this instant */ }
      }
      setModalOpen(false);
      sel.clear();
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  // Bulk status change for visitations — e.g. mark several as Confirmed
  // or Completed after a visit day without opening each one individually.
  async function bulkSetStatus(status) {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    setBulkError("");
    try {
      const updates = await Promise.all(rows.map((a) => appointmentsApi.updateAppointment(a.id, { status })));
      setAppointments((prev) => prev.map((x) => {
        const idx = rows.findIndex((r) => r.id === x.id);
        return idx === -1 ? x : { ...x, ...updates[idx] };
      }));
      rows.forEach((a) => addAudit("Update visitation status", a.status, status, `${a.id} · ${a.visitorName}`));
      sel.clear();
    } catch (err) {
      setBulkError(err.body?.message || "Couldn't update one or more visitations — try again.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]"
          value={pickDate ? "custom" : when}
          onChange={(e) => { const v = e.target.value; if (v === "custom") { setWhen("all"); } else { setWhen(v); setPickDate(""); } }}
        >
          {WHEN_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          <option value="custom">Custom date…</option>
        </select>
        <input className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} title="Pick a specific day" />
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fCompany} onChange={(e) => { setFCompany(e.target.value); setFBatch("All"); }} title="Filter by company">
          <option value="All">All companies</option>{companyOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fBatch} onChange={(e) => setFBatch(e.target.value)} title="Filter by batch">
          <option value="All">All batches</option>{batchOptions.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fGuide} onChange={(e) => setFGuide(e.target.value)} title="Filter by guide">
          <option value="All">All guides</option>{guideOptions.map((g) => <option key={g}>{g}</option>)}
        </select>
        {(when !== "all" || pickDate || fCompany !== "All" || fBatch !== "All" || fGuide !== "All") &&
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent px-2.5 py-[5px] text-xs" onClick={() => { clearWhen(); setFCompany("All"); setFBatch("All"); setFGuide("All"); }}>Clear filters</button>}
        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" style={{ marginLeft: "auto" }} onClick={openNew}>+ Register visitor</button>}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={sel.selectedCount !== 1} onClick={openEditSelected}>Edit</button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--blue)] bg-[color:var(--blue-bg)] text-[color:var(--blue)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Confirmed")}>Mark Confirmed</button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--green)] bg-[color:var(--green-bg)] text-[color:var(--green)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Completed")}>Mark Completed</button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--red)] bg-[color:var(--red-bg)] text-[color:var(--red)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Cancelled")}>Mark Cancelled</button>
        </BulkActionBar>
      )}
      {bulkError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{bulkError}</div>}

      {sorted.length === 0 ? <EmptyState text="No visitations found." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group">
                {canEdit && <HeaderCheckbox checked={sel.isAllSelected(sorted)} onChange={() => sel.toggleAll(sorted)} />}
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Visitor</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Company / Batch</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Date</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Time</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Guide</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th>
              </tr></thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id} className="group">
                    {canEdit && <RowCheckbox checked={sel.isSelected(a)} onChange={() => sel.toggle(a)} label={`Select ${a.id}`} />}
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{a.id}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{a.visitorName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.phone}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{a.company}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.batch}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{fmtDate(a.visitDate)}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{a.visitTime}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{a.guideName || a.assignedStaff}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.guidePhone}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={a.status} kind={APPT_STAMP[a.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing}` : "Register visitor"} wide>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
          <Field label="Auction visit setup" full>
            <select className={inputCls} value={draft.setupId} onChange={(e) => applySetup(e.target.value)}>
              <option value="">Select company / batch / guide…</option>
              {setupOptions.map((v) => <option key={v.id} value={v.id}>{v.company} — {v.batch} — Guide: {v.guideName}</option>)}
            </select>
          </Field>
          {selectedSetup && (
            <div className="col-span-2" style={{ fontSize: 12.5, color: "var(--text-2)", background: "var(--paper)", borderRadius: 6, padding: "8px 10px" }}>
              <b>{selectedSetup.address}</b> — {selectedSetup.items}<br />
              Guide {selectedSetup.guideName} ({selectedSetup.guidePhone}), {selectedSetup.guideTimeFrom}–{selectedSetup.guideTimeTo}
            </div>
          )}
          <Field label="Visitor name"><input className={inputCls} value={draft.visitorName} onChange={(e) => setDraft({ ...draft, visitorName: e.target.value })} /></Field>
          <Field label="Phone number"><input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
          <Field label="Visit date"><input type="date" className={inputCls} value={draft.visitDate} onChange={(e) => setDraft({ ...draft, visitDate: e.target.value })} /></Field>
          <Field label="Visit time"><input type="time" className={inputCls} value={draft.visitTime} onChange={(e) => setDraft({ ...draft, visitTime: e.target.value })} /></Field>
          {editing && (
            <Field label="Status"><select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{APPT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          )}
          <Field label="Notes" full><textarea className={inputCls} rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
        </div>
        {!editing && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Registering this visitor automatically adds them to the Follow-ups list for a call back after the visit.</div>}
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Register visitor"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}