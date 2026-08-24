import { useState, useMemo } from "react";
import { FOLLOWUP_STATUSES, FOLLOWUP_STAMP } from "../constants/lookups";
import { fmtDate } from "../utils/format";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { followups as followupsApi } from "../api";

export default function Followups({ followups, setFollowups, canEdit, addAudit }) {
  const [fStatus, setFStatus] = useState("All");
  const [fCompany, setFCompany] = useState("All");
  const [fGuide, setFGuide] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const companyOptions = useMemo(() => [...new Set(followups.filter((f) => f.company).map((f) => f.company))], [followups]);
  const guideOptions = useMemo(() => [...new Set(followups.filter((f) => f.guideName).map((f) => f.guideName))], [followups]);

  const filtered = followups.filter((f) => {
    if (fStatus !== "All" && f.status !== fStatus) return false;
    if (fCompany !== "All" && f.company !== fCompany) return false;
    if (fGuide !== "All" && f.guideName !== fGuide) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));

  function openEdit(f) {
    setEditing(f.id);
    setDraft({ status: FOLLOWUP_STATUSES.includes(f.status) ? f.status : "", notes: f.notes || "" });
    setSaveError("");
    setModalOpen(true);
  }
  async function save() {
    if (!draft.status) return;
    const prev = followups.find((x) => x.id === editing);
    setSaving(true);
    setSaveError("");
    try {
      const updated = await followupsApi.updateFollowup(editing, { status: draft.status, notes: draft.notes });
      setFollowups((p) => p.map((x) => (x.id === editing ? { ...x, ...updated } : x)));
      if (prev) addAudit("Update follow-up", prev.status, draft.status, `${prev.id} · ${prev.callerName}`);
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
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option>All</option><option>Pending</option><option>Satisfied</option><option>Not Satisfied</option><option>No Show</option>
        </select>
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fCompany} onChange={(e) => setFCompany(e.target.value)} title="Filter by company">
          <option value="All">All companies</option>{companyOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fGuide} onChange={(e) => setFGuide(e.target.value)} title="Filter by guide">
          <option value="All">All guides</option>{guideOptions.map((g) => <option key={g}>{g}</option>)}
        </select>
        {(fCompany !== "All" || fGuide !== "All") &&
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent px-2.5 py-[5px] text-xs" onClick={() => { setFCompany("All"); setFGuide("All"); }}>Clear</button>}
      </div>
      {sorted.length === 0 ? <EmptyState text="No follow-ups scheduled." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group"><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Caller</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Company / Batch</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Guide</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Follow-up date</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Operator</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Reminder</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th>{canEdit && <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Actions</th>}</tr></thead>
              <tbody>
                {sorted.map((f) => (
                  <tr key={f.id} className="group">
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{f.id}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{f.callerName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{f.inquiryId}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{f.company || "—"}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{f.batch || ""}</div></td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{f.guideName || "—"}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{fmtDate(f.date)}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{f.assignedOperator}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{f.reminder ? "Yes" : "No"}</td>
                    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={f.status} kind={FOLLOWUP_STAMP[f.status] || "amber"} /></td>
                    {canEdit && <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" onClick={() => openEdit(f)}>Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing}` : "Edit follow-up"}>
        {draft && (
          <>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
              <Field label="Status" full>
                <select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="">Select status…</option>
                  {FOLLOWUP_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Notes" full>
                <textarea className={inputCls} rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </Field>
            </div>
            {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={!draft.status || saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}