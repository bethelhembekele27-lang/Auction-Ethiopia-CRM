import { useState } from "react";
import { Stamp, Field, Modal, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { escalations as escalationsApi } from "../api";

export default function Escalations({ escalations, setEscalations, addAudit, session }) {
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveNote, setResolveNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const isOperator = session && session.role === "call_operator";
  const canResolve = session && session.role === "auction_manager";

  const visible = isOperator
    ? escalations.filter((e) => e.createdByUsername === session.username)
    : escalations;

  const open = visible.filter((e) => e.status === "Open");
  const resolved = visible.filter((e) => e.status === "Resolved");

  const sel = useRowSelection((e) => e.id);

  function openResolve(e) { setResolveTarget(e); setResolveNote(""); setSaveError(""); }
  function openResolveSelected() {
    const rows = sel.selectedFrom(open);
    if (rows.length === 1) openResolve(rows[0]);
  }
  async function saveResolve() {
    if (!resolveNote.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await escalationsApi.resolveEscalation(resolveTarget.id, resolveNote.trim());
      setEscalations((prev) => prev.map((e) => (e.id === resolveTarget.id ? { ...e, ...updated } : e)));
      addAudit("Resolve manager request", "Open", "Resolved", `${resolveTarget.id} · notified ${resolveTarget.operatorName}`);
      setResolveTarget(null);
      sel.clear();
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't resolve — try again.");
    } finally {
      setSaving(false);
    }
  }

  function EscTable({ rows, selectable }) {
    return (
      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden" style={{ marginBottom: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full border-collapse text-[13px] min-w-[640px]">
            <thead><tr className="group">
              {selectable && <HeaderCheckbox checked={sel.isAllSelected(rows)} onChange={() => sel.toggleAll(rows)} />}
              <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Inquiry</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Caller</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Raised by</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Note</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th>{!selectable && <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Resolution</th>}
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="group">
                  {selectable && <RowCheckbox checked={sel.isSelected(e)} onChange={() => sel.toggle(e)} label={`Select ${e.id}`} />}
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.id}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.inquiryId}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{e.callerName}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{e.operatorName}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] max-w-[280px]">{e.note}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={e.status} kind={e.status === "Open" ? "amber" : "green"} /></td>
                  {!selectable && <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] max-w-[280px]">{e.resolutionNote}</td>}
                </tr>
              ))}
              {!rows.length && <tr className="group"><td colSpan={selectable ? 7 : 7} className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] text-[color:var(--text-3)]">None.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: "4px 2px 10px" }}>
        <h3 style={{ margin: 0 }}>{isOperator ? "Your open requests — awaiting Auction Manager" : "Open — needs Auction Manager action"}</h3>
      </div>

      {canResolve && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={sel.selectedCount !== 1} onClick={openResolveSelected}>Mark resolved</button>
        </BulkActionBar>
      )}

      <EscTable rows={open} selectable={canResolve} />
      <div style={{ padding: "4px 2px 10px" }}><h3 style={{ margin: 0 }}>Resolved</h3></div>
      <EscTable rows={resolved} selectable={false} />

      <Modal open={!!resolveTarget} onClose={() => setResolveTarget(null)} title={resolveTarget ? `Resolve ${resolveTarget.id}` : "Resolve"}>
        {resolveTarget && (
          <>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
              <Field label="Caller"><input className={inputCls} value={resolveTarget.callerName} disabled /></Field>
              <Field label="Raised by"><input className={inputCls} value={resolveTarget.operatorName} disabled /></Field>
              <Field label="Their note" full><textarea className={inputCls} rows={2} value={resolveTarget.note} disabled /></Field>
              <Field label="How was it fixed?" full>
                <textarea className={inputCls} rows={3} value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="What you checked / fixed — this goes back to the operator." />
              </Field>
            </div>
            {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={saveResolve}>{saving ? "Sending…" : "Send fix notification"}</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setResolveTarget(null)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}