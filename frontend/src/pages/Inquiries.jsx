import { useState, useMemo, useRef } from "react";
import { CATEGORIES, PRIORITIES, STATUSES, COMPLAINT_CATEGORIES, DEPARTMENTS, PRIORITY_STAMP, STATUS_STAMP } from "../constants/lookups";
import { todayISO, fmtDate } from "../utils/format";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { emptyAppt } from "./Visitations";
import { isSetupOpen } from "./VisitSetups";
import { emptyComplaint } from "./Complaints";
import { inquiries as inquiriesApi, appointments as appointmentsApi, followups as followupsApi, complaints as complaintsApi, escalations as escalationsApi } from "../api";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";
import { EditIcon, DeleteIcon, CalendarIcon, SendIcon } from "../components/icons";
import AutoCompleteField from "../components/AutoCompleteField";

const emptyInquiry = {
  id: "", callerName: "", phone: "", company: "", auction: "", batch: "", category: CATEGORIES[0],
  priority: "Medium", operator: "", dateTime: "", description: "", status: "Open",
  followUpDate: "", resolutionNotes: "", resolvedDate: "", attachments: [],
};

export default function Inquiries({ inquiries, setInquiries, setFollowups, setAppointments, setComplaints, setEscalations, visitSetups, employees, session, canEdit, addAudit }) {
  const [query, setQuery] = useState("");
  const [fCategory, setFCategory] = useState("All");
  const [fPriority, setFPriority] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fOperator, setFOperator] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyInquiry);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");


  const [apptModalOpen, setApptModalOpen] = useState(false);
  const [apptDraft, setApptDraft] = useState(null);
  const [apptSaving, setApptSaving] = useState(false);
  const [apptError, setApptError] = useState("");

  const [cmpModalOpen, setCmpModalOpen] = useState(false);
  const [cmpDraft, setCmpDraft] = useState(null);
  const [cmpSaving, setCmpSaving] = useState(false);
  const [cmpError, setCmpError] = useState("");

  const [escModalOpen, setEscModalOpen] = useState(false);
  const [escDraft, setEscDraft] = useState(null);
  const [escSaving, setEscSaving] = useState(false);
  const [escError, setEscError] = useState("");

  const sel = useRowSelection((i) => i.id);

  const openVisitSetups = useMemo(() => (visitSetups || []).filter(isSetupOpen), [visitSetups]);
  const setupOptions = useMemo(() => {
    if (apptDraft?.setupId && !openVisitSetups.some((v) => v.id === apptDraft.setupId)) {
      const current = (visitSetups || []).find((v) => v.id === apptDraft.setupId);
      if (current) return [...openVisitSetups, current];
    }
    return openVisitSetups;
  }, [openVisitSetups, visitSetups, apptDraft]);

  const auctionOptions = useMemo(
    () => [...new Set(inquiries.map((i) => i.auction).filter(Boolean))].sort(),
    [inquiries]
  );
  const batchOptions = useMemo(
    () => [...new Set(inquiries.map((i) => i.batch).filter(Boolean))].sort(),
    [inquiries]
  );
  const selectedSetup = apptDraft ? (visitSetups || []).find((v) => v.id === apptDraft.setupId) : null;

  const filtered = useMemo(() => {
    return inquiries.filter((i) => {
      if (fCategory !== "All" && i.category !== fCategory) return false;
      if (fPriority !== "All" && i.priority !== fPriority) return false;
      if (fStatus !== "All" && i.status !== fStatus) return false;
      if (fOperator !== "All" && i.operator !== fOperator) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!(i.callerName.toLowerCase().includes(q) || i.phone.includes(q) || i.company.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  }, [inquiries, query, fCategory, fPriority, fStatus, fOperator]);

  const operatorOptions = useMemo(
    () => (employees || []).filter((e) => e.role === "call_operator").map((e) => e.name),
    [employees]
  );
  // Single-selected row, used to enable/disable every per-record action
  // button in the top bar below.
  const soleSelected = useMemo(() => {
    const rows = sel.selectedFrom(filtered);
    return rows.length === 1 ? rows[0] : null;
  }, [sel.selected, filtered]);
  const { pending, confirm, cancel, run } = useConfirm();
  async function bulkDelete() {
    const rows = sel.selectedFrom(filtered);
    if (!rows.length) return;
    confirm(`Permanently delete ${rows.length} inquiry(ies)? This cannot be undone.`, async () => {
      try {
        await Promise.all(rows.map((i) => inquiriesApi.deleteInquiry(i.id)));
        setInquiries((prev) => prev.filter((i) => !rows.some((r) => r.id === i.id)));
        rows.forEach((i) => addAudit("Delete inquiry", `${i.id} · ${i.callerName}`, "—", "Permanently removed"));
        sel.clear();
      } catch (err) {
        setSaveError(err.body?.message || "Couldn't delete one or more inquiries — try again.");
      }
    });
  }
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !editing) return; // real upload needs a saved inquiry id — see note below
    setUploading(true);
    try {
      const uploaded = await inquiriesApi.uploadAttachment(editing, file);
      setDraft((d) => ({ ...d, attachments: [...d.attachments, uploaded] }));
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't upload file — try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function removeAttachment(att) {
    if (editing && att.id) {
      try { await inquiriesApi.deleteAttachment(editing, att.id); } catch { /* best effort */ }
    }
    setDraft((d) => ({ ...d, attachments: d.attachments.filter((a) => a !== att) }));
  }

  function openNew() {
    setEditing(null);
    setDraft({ ...emptyInquiry, operator: operatorOptions[0] || "", dateTime: new Date().toISOString().slice(0, 16) });
    setSaveError("");
    setModalOpen(true);
  }
  function openEdit(i) {
    setEditing(i.id);
    setDraft({ ...i });  
    setSaveError("");
    setModalOpen(true);
  }
  function openEditSelected() { if (soleSelected) openEdit(soleSelected); }
  async function save() {
    if (!draft.callerName || !draft.phone) return;
    let record = { ...draft };
    if (["Resolved", "Closed"].includes(record.status) && !record.resolvedDate) {
      record.resolvedDate = todayISO();
    }
    // DRF DateFields reject "" — convert empty date strings to null
    if (!record.followUpDate) record.followUpDate = null;
    if (!record.resolvedDate) record.resolvedDate = null;

    setSaving(true);
    setSaveError("");
    try {
    // ...rest unchanged
      if (editing) {
        const prev = inquiries.find((i) => i.id === editing);
        const updated = await inquiriesApi.updateInquiry(editing, record);
        setInquiries((prevList) => prevList.map((i) => (i.id === editing ? { ...i, ...updated } : i)));
        if (prev && prev.status !== record.status) {
          addAudit("Update inquiry status", prev.status, record.status, `${record.id} · ${record.callerName}`);
        } else {
          addAudit("Edit inquiry", "—", record.id, `Details updated for ${record.callerName}`);
        }
      } else {
        const created = await inquiriesApi.createInquiry(record);
        setInquiries((prevList) => [created, ...prevList]);
        addAudit("Log inquiry", "—", `${created.id} created`, `${created.category} from ${created.callerName}`);
      }
      setModalOpen(false);
      sel.clear();
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }
  
  function openEscalationFor(inq) {
    if (inq.priority !== "Urgent") return;
    setEscDraft({ inquiryId: inq.id, callerName: inq.callerName, note: "" });
    setEscError("");
    setEscModalOpen(true);
  }
  function openEscalationSelected() { if (soleSelected && soleSelected.priority === "Urgent") openEscalationFor(soleSelected); }
  async function saveEscalation() {
    if (!escDraft.note.trim()) return;
    setEscSaving(true);
    setEscError("");
    try {
      const created = await escalationsApi.createEscalation({
        inquiryId: escDraft.inquiryId, callerName: escDraft.callerName,
        operatorName: session.operatorName || session.username, createdByUsername: session.username,
        note: escDraft.note.trim(),
      });
      setEscalations((prev) => [created, ...prev]);
      addAudit("Send to Auction Manager", "—", `${created.id} created`, `${created.inquiryId} · ${created.callerName} — flagged by ${created.operatorName}`);
      setEscModalOpen(false);
      sel.clear();
    } catch (err) {
      setEscError(err.body?.message || "Couldn't send to manager — try again.");
    } finally {
      setEscSaving(false);
    }
  }

  function openVisitationFor(inq) {
    setApptDraft({
      ...emptyAppt,
      auction: inq.auction || "",
      visitorName: inq.callerName || "",
      phone: inq.phone || "",
      notes: inq.batch ? `Regarding ${inq.batch}` : "",
    });
    setApptError("");
    setApptModalOpen(true);
  }
  function openVisitationSelected() { if (soleSelected) openVisitationFor(soleSelected); }
  function applySetup(setupId) {
    const s = (visitSetups || []).find((v) => v.id === setupId);
    if (!s) { setApptDraft((d) => ({ ...d, setupId: "" })); return; }
    setApptDraft((d) => ({
      ...d, setupId: s.id, company: s.company, batch: s.batch,
      guideName: s.guideName, guidePhone: s.guidePhone, address: s.address, items: s.items,
      assignedStaff: s.guideName,
    }));
  }
  async function saveVisitation() {
    if (!apptDraft.visitorName || !apptDraft.phone || !apptDraft.visitDate) return;
    setApptSaving(true);
    setApptError("");
    try {
      const created = await appointmentsApi.createAppointment(apptDraft);
      setAppointments((prev) => [created, ...prev]);
      addAudit("Book visitation", "—", `${created.id} created`, `${created.visitorName} for ${created.company || created.auction} (from inquiry)`);
      try {
        const refreshed = await followupsApi.listFollowups();
        setFollowups(refreshed || []);
      } catch { /* non-fatal */ }
      setApptModalOpen(false);
      sel.clear();
    } catch (err) {
      setApptError(err.body?.message || "Couldn't book visitation — try again.");
    } finally {
      setApptSaving(false);
    }
  }

  function openComplaintFor(source) {
    setCmpDraft({
      ...emptyComplaint,
      inquiryId: source.id || "",
      callerName: source.callerName || "",
      phone: source.phone || "",
      description: source.description || "",
      date: todayISO(),
    });
    setCmpError("");
    setCmpModalOpen(true);
  }
  function openComplaintSelected() { if (soleSelected) openComplaintFor(soleSelected); }
  async function saveComplaint() {
    if (!cmpDraft.callerName || !cmpDraft.description) return;
    setCmpSaving(true);
    setCmpError("");
    try {
      const created = await complaintsApi.createComplaint(cmpDraft);
      setComplaints((prev) => [created, ...prev]);
      addAudit("Log complaint", "—", `${created.category} — ${created.callerName} (from inquiry)`, created.id);
      setCmpModalOpen(false);
      sel.clear();
    } catch (err) {
      setCmpError(err.body?.message || "Couldn't log complaint — try again.");
    } finally {
      setCmpSaving(false);
    }
  }

  const canEscalateSelected = canEdit && session.role === "call_operator" && soleSelected && soleSelected.priority === "Urgent";

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input className="w-[220px] font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" placeholder="Search name, phone, company, ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
          <option value="All">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
          <option value="All">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="All">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fOperator} onChange={(e) => setFOperator(e.target.value)}>
          <option value="All">All operators</option>{operatorOptions.map((o) => <option key={o}>{o}</option>)}
        </select>
        {session.role === "call_operator" && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" style={{ marginLeft: "auto" }} onClick={openNew}>+ New inquiry</button>}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!soleSelected} onClick={openEditSelected}>
            <EditIcon /><span>Edit</span>
          </button>

          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!soleSelected} onClick={openVisitationSelected}>
            <CalendarIcon /><span>Book visitation</span>
          </button>

          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!soleSelected} onClick={openComplaintSelected}>
            Complaint
          </button>

          {session.role === "call_operator" && (
            <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--red)] bg-[color:var(--red-bg)] text-[color:var(--red)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!canEscalateSelected} title={soleSelected && soleSelected.priority !== "Urgent" ? "Only Urgent inquiries can be sent to the manager" : ""} onClick={openEscalationSelected}>
              <SendIcon /><span>Send to manager</span>
            </button>
          )}

          {session.role === "administrator" && (
            <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--red)] bg-[color:var(--red-bg)] text-[color:var(--red)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={bulkDelete}>
              <DeleteIcon /><span>Delete</span>
            </button>
          )}
        </BulkActionBar>
      )}

      {filtered.length === 0 ? <EmptyState text="No inquiries match these filters." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group">
                {canEdit && <HeaderCheckbox checked={sel.isAllSelected(filtered)} onChange={() => sel.toggleAll(filtered)} />}
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Caller</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Category</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Priority</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Operator</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Date</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th>
              </tr></thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="group">
                    {canEdit && <RowCheckbox checked={sel.isSelected(i)} onChange={() => sel.toggle(i)} label={`Select ${i.id}`} />}
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{i.id}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{i.callerName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{i.phone}{i.company ? ` · ${i.company}` : ""}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{i.category}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{i.auction}{i.batch ? ` · ${i.batch}` : ""}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={i.priority} kind={PRIORITY_STAMP[i.priority]} /></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{i.operator}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{fmtDate(i.dateTime.slice(0, 10))}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={i.status} kind={STATUS_STAMP[i.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing}` : "New inquiry"} wide>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
          <Field label="Caller name"><input className={inputCls} value={draft.callerName} onChange={(e) => setDraft({ ...draft, callerName: e.target.value })} /></Field>
          <Field label="Phone number"><input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
          <Field label="Company (optional)"><input className={inputCls} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></Field>
          <Field label="Related auction (optional)">
            <AutoCompleteField
              value={draft.auction}
              onChange={(v) => setDraft({ ...draft, auction: v })}
              options={auctionOptions}
              placeholder="Choose a past auction or type a new one — leave blank if general"
            />
          </Field>
          <Field label="Auction batch (optional)">
            <AutoCompleteField
              value={draft.batch}
              onChange={(v) => setDraft({ ...draft, batch: v })}
              options={batchOptions}
              placeholder="Choose a past batch or type a new one"
            />
          </Field>
          <Field label="Category">
            <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Priority">
            <select className={inputCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Assigned operator">
            <select className={inputCls} value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })}>{operatorOptions.map((o) => <option key={o}>{o}</option>)}</select>
          </Field>
          <Field label="Date & time"><input type="datetime-local" className={inputCls} value={draft.dateTime} onChange={(e) => setDraft({ ...draft, dateTime: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Follow-up date"><input type="date" className={inputCls} value={draft.followUpDate} onChange={(e) => setDraft({ ...draft, followUpDate: e.target.value })} /></Field>
          <Field label="Inquiry description" full>
            <textarea className={inputCls} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          <Field label="Resolution notes" full>
            <textarea className={inputCls} rows={2} value={draft.resolutionNotes} onChange={(e) => setDraft({ ...draft, resolutionNotes: e.target.value })} />
          </Field>
        </div>

        <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[color:var(--text-2)]" style={{ margin: "18px 0 8px" }}>Attachments</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {draft.attachments.map((a, idx) => (
            <div className="flex items-center gap-2 text-[13px] px-2.5 py-2 rounded-[5px] bg-[color:var(--paper)]" key={a.id || idx}>
              {a.fileName || a}
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-transparent" style={{ marginLeft: "auto" }} onClick={() => removeAttachment(a)}>Remove</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input ref={fileInputRef} type="file" onChange={handleFileSelected} style={{ display: "none" }} disabled={!editing || uploading} />
          <button
            className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs"
            disabled={!editing || uploading}
            title={!editing ? "Save the inquiry first, then attach files" : ""}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Attach file"}
          </button>
        </div>
        {!editing && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>Save this inquiry first — attachments upload directly to the saved record.</div>}
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 12 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Create inquiry"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" onClick={() => openComplaintFor(draft)}>Log complaint</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>

      <Modal open={apptModalOpen} onClose={() => setApptModalOpen(false)} title="Register visitor" wide>
        {apptDraft && (
          <>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
              <Field label="Auction visit setup" full>
                <select className={inputCls} value={apptDraft.setupId} onChange={(e) => applySetup(e.target.value)}>
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
              <Field label="Visitor name"><input className={inputCls} value={apptDraft.visitorName} onChange={(e) => setApptDraft({ ...apptDraft, visitorName: e.target.value })} /></Field>
              <Field label="Phone number"><input className={inputCls} value={apptDraft.phone} onChange={(e) => setApptDraft({ ...apptDraft, phone: e.target.value })} /></Field>
              <Field label="Visit date"><input type="date" className={inputCls} value={apptDraft.visitDate} onChange={(e) => setApptDraft({ ...apptDraft, visitDate: e.target.value })} /></Field>
              <Field label="Visit time"><input type="time" className={inputCls} value={apptDraft.visitTime} onChange={(e) => setApptDraft({ ...apptDraft, visitTime: e.target.value })} /></Field>
              <Field label="Notes" full><textarea className={inputCls} rows={2} value={apptDraft.notes} onChange={(e) => setApptDraft({ ...apptDraft, notes: e.target.value })} /></Field>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>Registering this visitor automatically adds them to the Follow-ups list for a call back after the visit.</div>
            {apptError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{apptError}</div>}
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={apptSaving} onClick={saveVisitation}>{apptSaving ? "Booking…" : "Register visitor"}</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setApptModalOpen(false)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={cmpModalOpen} onClose={() => setCmpModalOpen(false)} title="New complaint" wide>
        {cmpDraft && (
          <>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
              <Field label="Related inquiry ID (optional)"><input className={inputCls} value={cmpDraft.inquiryId} onChange={(e) => setCmpDraft({ ...cmpDraft, inquiryId: e.target.value })} /></Field>
              <Field label="Caller name"><input className={inputCls} value={cmpDraft.callerName} onChange={(e) => setCmpDraft({ ...cmpDraft, callerName: e.target.value })} /></Field>
              <Field label="Phone number"><input className={inputCls} value={cmpDraft.phone} onChange={(e) => setCmpDraft({ ...cmpDraft, phone: e.target.value })} /></Field>
              <Field label="Category"><select className={inputCls} value={cmpDraft.category} onChange={(e) => setCmpDraft({ ...cmpDraft, category: e.target.value })}>{COMPLAINT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Assigned department"><select className={inputCls} value={cmpDraft.department} onChange={(e) => setCmpDraft({ ...cmpDraft, department: e.target.value })}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
              <Field label="Priority"><select className={inputCls} value={cmpDraft.priority} onChange={(e) => setCmpDraft({ ...cmpDraft, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Status"><select className={inputCls} value={cmpDraft.status} onChange={(e) => setCmpDraft({ ...cmpDraft, status: e.target.value })}><option>Open</option><option>Resolved</option></select></Field>
              <Field label="Description" full><textarea className={inputCls} rows={2} value={cmpDraft.description} onChange={(e) => setCmpDraft({ ...cmpDraft, description: e.target.value })} /></Field>
              <Field label="Resolution" full><textarea className={inputCls} rows={2} value={cmpDraft.resolution} onChange={(e) => setCmpDraft({ ...cmpDraft, resolution: e.target.value })} /></Field>
            </div>
            {cmpError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{cmpError}</div>}
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={cmpSaving} onClick={saveComplaint}>{cmpSaving ? "Logging…" : "Log complaint"}</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setCmpModalOpen(false)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={escModalOpen} onClose={() => setEscModalOpen(false)} title="Send to Auction Manager">
        {escDraft && (
          <>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
              <Field label="Caller"><input className={inputCls} value={escDraft.callerName} disabled /></Field>
              <Field label="Inquiry"><input className={inputCls} value={escDraft.inquiryId} disabled /></Field>
              <Field label="What's the problem, and why is it on the auction company?" full>
                <textarea className={inputCls} rows={4} value={escDraft.note} onChange={(e) => setEscDraft({ ...escDraft, note: e.target.value })} placeholder="e.g. Item condition doesn't match the listing — this needs Operations to check, not something I can fix from the call desk." />
              </Field>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>The Auction Manager gets notified right away. You'll get a notification back once it's resolved.</div>
            {escError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{escError}</div>}
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={escSaving} onClick={saveEscalation}>{escSaving ? "Sending…" : "Send to Auction Manager"}</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setEscModalOpen(false)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>
      <ConfirmDialog pending={pending} onCancel={cancel} onConfirm={run} />
    </div>
  );
}
