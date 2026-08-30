import { useState, useMemo } from "react";
import { CATEGORIES, PRIORITIES, STATUSES, OPERATORS, COMPLAINT_CATEGORIES, DEPARTMENTS, PRIORITY_STAMP, STATUS_STAMP } from "../constants/lookups";
import { todayISO, fmtDate } from "../utils/format";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { emptyAppt } from "./Visitations";
import { isSetupOpen } from "./VisitSetups";
import { emptyComplaint } from "./Complaints";
import { inquiries as inquiriesApi, appointments as appointmentsApi, followups as followupsApi, complaints as complaintsApi, escalations as escalationsApi } from "../api";

const emptyInquiry = {
  id: "", callerName: "", phone: "", company: "", auction: "", batch: "", category: CATEGORIES[0],
  priority: "Medium", operator: OPERATORS[0], dateTime: "", description: "", status: "Open",
  followUpDate: "", resolutionNotes: "", resolvedDate: "", attachments: [],
};

export default function Inquiries({ inquiries, setInquiries, setFollowups, setAppointments, setComplaints, setEscalations, visitSetups, session, canEdit, addAudit }) {
  const [query, setQuery] = useState("");
  const [fCategory, setFCategory] = useState("All");
  const [fPriority, setFPriority] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fOperator, setFOperator] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyInquiry);
  const [attachName, setAttachName] = useState("");
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

  // Same open-setups-only pattern as Visitations.jsx, since "Book
  // visitation" now opens the identical Register-visitor flow (CHANGES.md
  // item 5) instead of its own free-text modal.
  const openVisitSetups = useMemo(() => (visitSetups || []).filter(isSetupOpen), [visitSetups]);
  const setupOptions = useMemo(() => {
    if (apptDraft?.setupId && !openVisitSetups.some((v) => v.id === apptDraft.setupId)) {
      const current = (visitSetups || []).find((v) => v.id === apptDraft.setupId);
      if (current) return [...openVisitSetups, current];
    }
    return openVisitSetups;
  }, [openVisitSetups, visitSetups, apptDraft]);
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

  function openNew() {
    setEditing(null);
    setDraft({ ...emptyInquiry, dateTime: new Date().toISOString().slice(0, 16) });
    setAttachName("");
    setSaveError("");
    setModalOpen(true);
  }
  function openEdit(i) {
    setEditing(i.id);
    setDraft({ ...i });
    setAttachName("");
    setSaveError("");
    setModalOpen(true);
  }
  async function save() {
    if (!draft.callerName || !draft.phone) return;
    let record = { ...draft };
    if (["Resolved", "Closed"].includes(record.status) && !record.resolvedDate) {
      record.resolvedDate = todayISO();
    }
    setSaving(true);
    setSaveError("");
    try {
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
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }
  function addAttachment() {
    if (!attachName.trim()) return;
    setDraft((d) => ({ ...d, attachments: [...d.attachments, attachName.trim()] }));
    setAttachName("");
  }

  function openEscalationFor(inq) {
    if (inq.priority !== "Urgent") return;
    setEscDraft({ inquiryId: inq.id, callerName: inq.callerName, note: "" });
    setEscError("");
    setEscModalOpen(true);
  }
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
    } catch (err) {
      setEscError(err.body?.message || "Couldn't send to manager — try again.");
    } finally {
      setEscSaving(false);
    }
  }

  // Rebuilt to match Visitations.jsx's Register-visitor flow exactly
  // (CHANGES.md item 5) — pick a registered Auction visit setup, which
  // fills in company/batch/guide/address automatically, rather than the
  // old free-text Assigned staff field. No Status field here either,
  // since this always creates a new visitation (never edits one), and
  // new visitations start as "Requested" regardless (item 2).
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
      // Server auto-creates the day-after follow-up (see API_SPEC.md §4) —
      // re-fetch follow-ups so it shows up right away.
      try {
        const refreshed = await followupsApi.listFollowups();
        setFollowups(refreshed || []);
      } catch { /* non-fatal */ }
      setApptModalOpen(false);
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
  async function saveComplaint() {
    if (!cmpDraft.callerName || !cmpDraft.description) return;
    setCmpSaving(true);
    setCmpError("");
    try {
      const created = await complaintsApi.createComplaint(cmpDraft);
      setComplaints((prev) => [created, ...prev]);
      addAudit("Log complaint", "—", `${created.category} — ${created.callerName} (from inquiry)`, created.id);
      setCmpModalOpen(false);
    } catch (err) {
      setCmpError(err.body?.message || "Couldn't log complaint — try again.");
    } finally {
      setCmpSaving(false);
    }
  }

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
          <option value="All">All operators</option>{OPERATORS.map((o) => <option key={o}>{o}</option>)}
        </select>
        {session.role === "call_operator" && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" style={{ marginLeft: "auto" }} onClick={openNew}>+ New inquiry</button>}
      </div>

      {filtered.length === 0 ? <EmptyState text="No inquiries match these filters." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group"><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Caller</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Category</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Priority</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Operator</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Date</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Actions</th></tr></thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="group">
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{i.id}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{i.callerName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{i.phone}{i.company ? ` · ${i.company}` : ""}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{i.category}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{i.auction}{i.batch ? ` · ${i.batch}` : ""}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={i.priority} kind={PRIORITY_STAMP[i.priority]} /></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{i.operator}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{fmtDate(i.dateTime.slice(0, 10))}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={i.status} kind={STATUS_STAMP[i.status]} /></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">
                      <div className="flex gap-1.5 flex-wrap">
                        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" onClick={() => openEdit(i)}>Edit</button>}
                        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" onClick={() => openVisitationFor(i)}>Book visitation</button>}
                        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" onClick={() => openComplaintFor(i)}>Complaint</button>}
                        {canEdit && session.role === "call_operator" && i.priority === "Urgent" && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-[color:var(--red-bg)] text-[color:var(--red)] border-[color:var(--red)]" onClick={() => openEscalationFor(i)}>Send to manager</button>}
                      </div>
                    </td>
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
            <input className={inputCls} placeholder="e.g. Vehicle Auction - July 2026 — leave blank if not about a specific auction" value={draft.auction} onChange={(e) => setDraft({ ...draft, auction: e.target.value })} />
          </Field>
          <Field label="Auction batch (optional)">
            <input className={inputCls} placeholder="e.g. Batch 2 — leave blank if calling about the company in general" value={draft.batch} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} />
          </Field>
          <Field label="Category">
            <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Priority">
            <select className={inputCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Assigned operator">
            <select className={inputCls} value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })}>{OPERATORS.map((o) => <option key={o}>{o}</option>)}</select>
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
            <div className="flex items-center gap-2 text-[13px] px-2.5 py-2 rounded-[5px] bg-[color:var(--paper)]" key={idx}>
              {a}
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-transparent" style={{ marginLeft: "auto" }} onClick={() => setDraft((d) => ({ ...d, attachments: d.attachments.filter((_, x) => x !== idx) }))}>Remove</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className={inputCls} placeholder="file_name.pdf" value={attachName} onChange={(e) => setAttachName(e.target.value)} />
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" onClick={addAttachment}>Attach</button>
        </div>
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 12 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Create inquiry"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" onClick={() => openComplaintFor(draft)}>Log complaint</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>

      {/* Book visitation — now the identical Register-visitor flow used on
          the Visitations page (CHANGES.md item 5): pick a registered
          Auction visit setup rather than typing "Assigned staff" free text,
          and no Status field since this is always a create, never an edit. */}
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
    </div>
  );
}