import { useState, useMemo } from "react";
import { fmtDate, todayISO } from "../utils/format";
import { VERIFICATION_STAMP } from "../constants/lookups";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { pickups as pickupsApi } from "../api";
import { EditIcon, DeleteIcon, PlusIcon, CheckIcon, SendIcon } from "../components/icons";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";
import MonthCalendar from "../components/MonthCalendar";
import AutoCompleteField from "../components/AutoCompleteField";
import { isValidEthiopianPhone, PHONE_HINT } from "../utils/validation";
import { getRecentUniqueOptions } from "../utils/recentOptions";

const PICKUP_STATUSES = ["Scheduled", "Completed", "Cancelled", "No Show"];
const PICKUP_STAMP = { Scheduled: "blue", Completed: "green", Cancelled: "gray", "No Show": "red" };

export const emptyPickup = {
  id: "", winnerName: "", phone: "", auction: "", itemDescription: "", quantity: "",
  paymentReference: "", pickupDate: "", pickupTime: "", guideName: "", guidePhone: "",
  address: "", mapsLink: "", status: "Scheduled",
};

export default function Pickups({ pickups, setPickups, canEdit, addAudit, session }) {
  const [fStatus, setFStatus] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyPickup);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const sel = useRowSelection((p) => p.id);
  const { pending, confirm, cancel, run } = useConfirm();

  const [confirmSending, setConfirmSending] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(null);

  const phoneOptions = useMemo(
    () => getRecentUniqueOptions(pickups, (p) => p.phone, (p) => p.pickupDate, 30),
    [pickups]
  );
  const auctionOptions = useMemo(
    () => getRecentUniqueOptions(pickups, (p) => p.auction, (p) => p.pickupDate, 30),
    [pickups]
  );

  const filtered = fStatus === "All" ? pickups : pickups.filter((p) => p.status === fStatus);
  const sorted = [...filtered].sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

  async function sendConfirmationFor(p) {
    setConfirmSending(true);
    setConfirmNotice(null);
    try {
      const res = await pickupsApi.sendConfirmation(p.id);
      const guidePart = res.guide ? `, guide ${res.guide.status}` : ", no guide phone on file — guide SMS skipped";
      addAudit("Send pickup confirmation", "—", p.id, `${p.winnerName} · winner ${res.visitor.status}${guidePart}`);
      setConfirmNotice({ kind: "ok", text: `Confirmation sent for ${p.id} — winner ${res.visitor.status}${guidePart}.` });
    } catch (err) {
      setConfirmNotice({ kind: "error", text: err.body?.message || "Couldn't send confirmation — try again." });
    } finally {
      setConfirmSending(false);
    }
  }
  function sendConfirmationSelected() {
    const rows = sel.selectedFrom(sorted);
    if (rows.length === 1) sendConfirmationFor(rows[0]);
  }

  async function bulkDelete() {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    confirm(`Permanently delete ${rows.length} pickup(s)? This cannot be undone.`, async () => {
      setBulkError("");
      try {
        await Promise.all(rows.map((p) => pickupsApi.deletePickup(p.id)));
        setPickups((prev) => prev.filter((p) => !rows.some((r) => r.id === p.id)));
        rows.forEach((p) => addAudit("Delete pickup", `${p.id} · ${p.winnerName}`, "—", "Permanently removed"));
        sel.clear();
      } catch (err) {
        setBulkError(err.body?.message || "Couldn't delete one or more pickups — try again.");
      }
    });
  }

  function openNew() { setEditing(null); setDraft(emptyPickup); setSaveError(""); setModalOpen(true); }
  function openEdit(p) { setEditing(p.id); setDraft({ ...p }); setSaveError(""); setModalOpen(true); }
  function openEditSelected() {
    const rows = sel.selectedFrom(sorted);
    if (rows.length === 1) openEdit(rows[0]);
  }

  async function save() {
    if (!draft.winnerName || !draft.phone || !draft.pickupDate || !draft.pickupTime) return;
    if (!isValidEthiopianPhone(draft.phone)) {
      setSaveError(`Phone number isn't valid. ${PHONE_HINT}`);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      if (editing) {
        const prev = pickups.find((p) => p.id === editing);
        const updated = await pickupsApi.updatePickup(editing, draft);
        setPickups((prev2) => prev2.map((p) => (p.id === editing ? { ...p, ...updated } : p)));
        if (prev && prev.status !== draft.status) {
          addAudit("Update pickup status", prev.status, draft.status, `${draft.id} · ${draft.winnerName}`);
        }
      } else {
        const created = await pickupsApi.createPickup(draft);
        setPickups((prev2) => [created, ...prev2]);
        addAudit("Schedule pickup", "—", `${created.id} created`, `${created.winnerName} · ${created.itemDescription || created.auction}`);
      }
      setModalOpen(false);
      sel.clear();
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function bulkSetStatus(status) {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    setBulkError("");
    try {
      const updates = await Promise.all(rows.map((p) => pickupsApi.updatePickup(p.id, { status })));
      setPickups((prev) => prev.map((x) => {
        const idx = rows.findIndex((r) => r.id === x.id);
        return idx === -1 ? x : { ...x, ...updates[idx] };
      }));
      rows.forEach((p) => addAudit("Update pickup status", p.status, status, `${p.id} · ${p.winnerName}`));
      sel.clear();
    } catch (err) {
      setBulkError(err.body?.message || "Couldn't update one or more pickups — try again.");
    }
  }

  return (
    <div>
      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-3.5 flex flex-wrap gap-2 items-center mb-4">
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="All">All statuses</option>{PICKUP_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="flex gap-1 ml-2">
          <button className={"font-sans text-[13px] font-medium rounded-[5px] border border-[color:var(--border)] px-2.5 py-[5px] text-xs cursor-pointer" + (viewMode === "list" ? " bg-[color:var(--brass)] text-white border-[color:var(--brass)]" : " bg-[color:var(--panel)] text-[color:var(--text)]")} onClick={() => setViewMode("list")}>List</button>
          <button className={"font-sans text-[13px] font-medium rounded-[5px] border border-[color:var(--border)] px-2.5 py-[5px] text-xs cursor-pointer" + (viewMode === "calendar" ? " bg-[color:var(--brass)] text-white border-[color:var(--brass)]" : " bg-[color:var(--panel)] text-[color:var(--text)]")} onClick={() => setViewMode("calendar")}>Calendar</button>
        </div>
        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)] btn-icon-label" style={{ marginLeft: "auto" }} onClick={openNew}>
          <PlusIcon /><span>Schedule pickup</span>
        </button>}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={sel.selectedCount !== 1} onClick={openEditSelected}>
            <EditIcon /><span>Edit</span>
          </button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={sel.selectedCount !== 1 || confirmSending} onClick={sendConfirmationSelected} title="Sends the winner + guide SMS with their pickup pass links">
            <SendIcon /><span>{confirmSending ? "Sending…" : "Send confirmation"}</span>
          </button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--green)] bg-[color:var(--green-bg)] text-[color:var(--green)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Completed")}>
            <CheckIcon /><span>Mark Completed</span>
          </button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] btn-danger-outline cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Cancelled")}>
            Mark Cancelled
          </button>
          {session && ["administrator", "auction_manager"].includes(session.role) && (
            <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] btn-danger-outline cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={bulkDelete}>
              <DeleteIcon /><span>Delete</span>
            </button>
          )}
        </BulkActionBar>
      )}
      {bulkError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{bulkError}</div>}
      {confirmNotice && (
        <div className={confirmNotice.kind === "ok" ? "bg-[color:var(--green-bg)] text-[color:var(--green)] text-[12.5px] px-3 py-2 rounded-md" : "bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md"} style={{ marginBottom: 12 }}>
          {confirmNotice.text}
        </div>
      )}

      {viewMode === "calendar" ? (
        <MonthCalendar
          items={sorted.map((p) => ({ ...p, date: p.pickupDate }))}
          getKey={(p) => p.id}
          getLabel={(p) => `${p.pickupTime} ${p.winnerName}`}
          onItemClick={(p) => openEdit(p)}
        />
      ) : (
        sorted.length === 0 ? <EmptyState text="No pickups scheduled." /> : (
          <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
            <div style={{ overflowX: "auto" }}>
              <table className="w-full border-collapse text-[13px] min-w-[640px]">
                <thead><tr className="group">
                  {canEdit && <HeaderCheckbox checked={sel.isAllSelected(sorted)} onChange={() => sel.toggleAll(sorted)} />}
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Winner</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Item(s)</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Date</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Time</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Guide</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Verification</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th>
                </tr></thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.id} className="group">
                      {canEdit && <RowCheckbox checked={sel.isSelected(p)} onChange={() => sel.toggle(p)} label={`Select ${p.id}`} />}
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{p.id}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{p.winnerName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.phone}</div></td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{p.itemDescription || p.auction || "—"}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{fmtDate(p.pickupDate)}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{p.pickupTime}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{p.guideName || "—"}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.guidePhone}</div></td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">
                        <Stamp text={p.verificationStatus || "Not sent"} kind={VERIFICATION_STAMP[p.verificationStatus] || "gray"} />
                      </td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={p.status} kind={PICKUP_STAMP[p.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing}` : "Schedule pickup"} wide>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
          <Field label="Winner name"><input className={inputCls} value={draft.winnerName} onChange={(e) => setDraft({ ...draft, winnerName: e.target.value })} /></Field>
          <Field label="Phone number">
            <AutoCompleteField value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} options={phoneOptions} placeholder="Choose a past winner or type a new number" />
          </Field>
          <Field label="Auction (optional)">
            <AutoCompleteField value={draft.auction} onChange={(v) => setDraft({ ...draft, auction: v })} options={auctionOptions} placeholder="Choose a past auction or type a new one" />
          </Field>
          <Field label="Quantity (optional)"><input className={inputCls} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></Field>
          <Field label="Payment reference (optional)"><input className={inputCls} value={draft.paymentReference} onChange={(e) => setDraft({ ...draft, paymentReference: e.target.value })} /></Field>
          <Field label="Pickup date"><input type="date" className={inputCls} value={draft.pickupDate} onChange={(e) => setDraft({ ...draft, pickupDate: e.target.value })} /></Field>
          <Field label="Pickup time"><input type="time" className={inputCls} value={draft.pickupTime} onChange={(e) => setDraft({ ...draft, pickupTime: e.target.value })} /></Field>
          <Field label="Guide name (optional)"><input className={inputCls} value={draft.guideName} onChange={(e) => setDraft({ ...draft, guideName: e.target.value })} /></Field>
          <Field label="Guide phone (optional)"><input className={inputCls} value={draft.guidePhone} onChange={(e) => setDraft({ ...draft, guidePhone: e.target.value })} /></Field>
          <Field label="Address (optional)"><input className={inputCls} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
          <Field label="Google Maps link (optional)" full><input className={inputCls} placeholder="https://maps.google.com/…" value={draft.mapsLink} onChange={(e) => setDraft({ ...draft, mapsLink: e.target.value })} /></Field>
          <Field label="Item description" full><textarea className={inputCls} rows={2} value={draft.itemDescription} onChange={(e) => setDraft({ ...draft, itemDescription: e.target.value })} /></Field>
          {editing && (
            <Field label="Status"><select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{PICKUP_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          )}
        </div>
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Schedule pickup"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>
      <ConfirmDialog pending={pending} onCancel={cancel} onConfirm={run} />
    </div>
  );
}