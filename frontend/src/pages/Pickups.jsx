import { useState, useMemo, useEffect } from "react";
import Pagination from "../components/Pagination";
import { VERIFICATION_STAMP } from "../constants/lookups";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { pickups as pickupsApi, pfm as pfmApi } from "../api";
import { DeleteIcon, PlusIcon, CheckIcon, SendIcon } from "../components/icons";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";
import RowDetail from "../components/RowDetail";
import AutoCompleteField from "../components/AutoCompleteField";
import { isValidEthiopianPhone, PHONE_HINT } from "../utils/validation";
import { getRecentUniqueOptions } from "../utils/recentOptions";

const PICKUP_STATUSES = ["Scheduled", "Completed", "Cancelled", "No Show"];
const PICKUP_STAMP = { Scheduled: "blue", Completed: "green", Cancelled: "gray", "No Show": "red" };

// No pickupDate/pickupTime: a winner collects at any time, so there is no
// single moment to record.
export const emptyPickup = {
  id: "", winnerName: "", phone: "", auction: "", itemDescription: "", quantity: "",
  paymentReference: "", guideName: "", guidePhone: "",
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
  const [viewing, setViewing] = useState(null);
  const sel = useRowSelection((p) => p.id);
  const { pending, confirm, cancel, run } = useConfirm();

  // Preview modal state for confirmation sending
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewError, setPreviewError] = useState("");
  const [confirmSending, setConfirmSending] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(null);

  /* ---------- PFM import ---------- */
  // Imported winners become Pickups with nothing to schedule — the winner
  // simply collects at any time.
  const [impRows, setImpRows] = useState(null);
  const [impPick, setImpPick] = useState(new Set());
  const [impLoading, setImpLoading] = useState(false);
  const [impError, setImpError] = useState("");

  async function runPreview() {
    setImpLoading(true); setImpError("");
    try {
      const { rows } = await pfmApi.preview();
      setImpRows(rows);
      setImpPick(new Set(rows.filter((r) => r.state === "new").map((r) => r.invoiceNumber)));
    } catch (e) { setImpError(e.body?.message || "Couldn't reach PFM."); }
    finally { setImpLoading(false); }
  }
  async function runImport() {
    setImpLoading(true); setImpError("");
    try {
      const res = await pfmApi.importWinners([...impPick]);
      addAudit("Import verified winners", "—", `${res.imported.length} imported`, res.imported.join(", ").slice(0, 150));
      setPickups((await pickupsApi.listPickups()) || []);
      setImpRows(null);
    } catch (e) { setImpError(e.body?.message || "Import failed — try again."); }
    finally { setImpLoading(false); }
  }

  // Recency now keys off createdAt — pickupDate no longer exists.
  const phoneOptions = useMemo(
    () => getRecentUniqueOptions(pickups, (p) => p.phone, (p) => p.createdAt, 30),
    [pickups]
  );
  const auctionOptions = useMemo(
    () => getRecentUniqueOptions(pickups, (p) => p.auction, (p) => p.createdAt, 30),
    [pickups]
  );

  const filtered = fStatus === "All" ? pickups : pickups.filter((p) => p.status === fStatus);
  // Already ordered newest-first by the backend.
  const sorted = filtered;

  const PAGE_SIZE = 30;
  const [pageNum, setPageNum] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(pageNum, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 whenever the status filter changes
  useEffect(() => { setPageNum(1); }, [fStatus]);

  async function openPreview() {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const results = await Promise.all(
        rows.map((p) => pickupsApi.previewConfirmation(p.id).then((r) => ({ ...r, name: p.winnerName })))
      );
      setPreviewItems(results);
    } catch (err) {
      setPreviewError(err.body?.message || "Couldn't load preview — try again.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function sendConfirmationSelected() {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    setConfirmSending(true);
    setConfirmNotice(null);
    try {
      const { results } = await pickupsApi.sendConfirmationBulk(rows.map((p) => p.id));
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      results.forEach((r) => {
        const row = rows.find((p) => p.id === r.id);
        if (row && r.ok) {
          const guidePart = r.guide ? `, guide ${r.guide.status}` : ", no guide phone on file — guide SMS skipped";
          addAudit("Send pickup confirmation", "—", r.id, `${row.winnerName} · winner ${r.visitor.status}${guidePart}`);
        }
      });
      setConfirmNotice({
        kind: failCount ? "error" : "ok",
        text: failCount
          ? `${okCount} sent, ${failCount} failed. Check individual records for details.`
          : `Confirmation sent for ${okCount} record${okCount === 1 ? "" : "s"}.`,
      });
      setPreviewOpen(false);
      sel.clear();
    } catch (err) {
      setConfirmNotice({ kind: "error", text: err.body?.message || "Couldn't send confirmation — try again." });
    } finally {
      setConfirmSending(false);
    }
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

  async function save() {
    if (!draft.winnerName) { setSaveError("Winner name is required."); return; }
    if (!draft.phone) { setSaveError("Phone number is required."); return; }
    if (!isValidEthiopianPhone(draft.phone)) {
      setSaveError(`Phone number isn't valid. ${PHONE_HINT}`);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const payload = { ...draft };
      if (editing) {
        const prev = pickups.find((p) => p.id === editing);
        const updated = await pickupsApi.updatePickup(editing, payload);
        setPickups((prev2) => prev2.map((p) => (p.id === editing ? { ...p, ...updated } : p)));
        if (prev && prev.status !== draft.status) {
          addAudit("Update pickup status", prev.status, draft.status, `${draft.id} · ${draft.winnerName}`);
        }
      } else {
        const created = await pickupsApi.createPickup(payload);
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
      {canEdit && (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-[18px] mb-4">
          <h3 style={{ margin: "0 0 4px" }}>Import verified winners</h3>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>
            Pull winners whose processing fee is verified. Dates and times can be added afterwards.
          </div>
          {impError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 10 }}>{impError}</div>}
          {!impRows && (
            <button className="font-sans text-[13px] font-semibold px-4 py-2.5 rounded-[6px] bg-[color:var(--ink)] text-white border border-[color:var(--ink)] cursor-pointer" disabled={impLoading} onClick={runPreview}>
              {impLoading ? "Loading…" : "Preview import"}
            </button>
          )}
          {impRows && (
            <>
              {impRows.length === 0 ? <EmptyState text="No verified winners to import." /> : (
                <div style={{ maxHeight: 320, overflowY: "auto" }} className="border border-[color:var(--border)] rounded-[8px]">
                  {impRows.map((r) => (
                    <label key={r.invoiceNumber} style={{ display: "flex", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--border)", fontSize: 13, opacity: r.state === "new" ? 1 : 0.55 }}>
                      <input type="checkbox" disabled={r.state !== "new"} checked={impPick.has(r.invoiceNumber)}
                        onChange={() => setImpPick((p) => { const n = new Set(p); n.has(r.invoiceNumber) ? n.delete(r.invoiceNumber) : n.add(r.invoiceNumber); return n; })} />
                      <span style={{ flex: 1 }}><b className="font-mono">{r.invoiceNumber}</b> — {r.bidderName || r.companyName} · {r.phone}
                        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{r.auction} {r.lotsSummary}{r.reason ? ` — ${r.reason}` : ""}</div></span>
                      <Stamp text={r.state === "new" ? "Ready" : r.state === "duplicate" ? "Imported" : "Invalid"} kind={r.state === "new" ? "blue" : r.state === "duplicate" ? "gray" : "red"} />
                    </label>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button className="font-sans text-[13px] font-semibold px-4 py-2.5 rounded-[6px] bg-[color:var(--ink)] text-white border border-[color:var(--ink)] cursor-pointer disabled:opacity-40" disabled={!impPick.size || impLoading} onClick={runImport}>
                  {impLoading ? "Importing…" : `Confirm import${impPick.size ? ` (${impPick.size})` : ""}`}
                </button>
                <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-transparent cursor-pointer" onClick={() => setImpRows(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-3.5 flex flex-wrap gap-2 items-center mb-4">
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="All">All statuses</option>{PICKUP_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {canEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)] btn-icon-label" style={{ marginLeft: "auto" }} onClick={openNew}>
          <PlusIcon /><span>Schedule pickup</span>
        </button>}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={openPreview}>
            <SendIcon /><span>Send confirmation</span>
          </button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--green)] bg-[color:var(--green-bg)] text-[color:var(--green)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Completed")}>
            <CheckIcon /><span>Mark Completed</span>
          </button>
          <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] btn-danger-outline cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Cancelled")}>
            Mark Cancelled
          </button>
          {session && ["administrator", "auction_manager", "call_operator"].includes(session.role) && (
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

      {sorted.length === 0 ? <EmptyState text="No pickups scheduled." /> : (
        <>
          <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
            <div style={{ overflowX: "auto" }}>
              <table className="w-full border-collapse text-[13px] min-w-[640px]">
                <thead><tr className="group">
                  {canEdit && <HeaderCheckbox checked={sel.isAllSelected(pageRows)} onChange={() => sel.toggleAll(pageRows)} />}
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">ID</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Winner</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Item(s)</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Guide</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Verification</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th>
                </tr></thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.id} className="group cursor-pointer" onClick={() => setViewing(p)}>
                      {canEdit && <RowCheckbox checked={sel.isSelected(p)} onChange={() => sel.toggle(p)} label={`Select ${p.id}`} />}
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{p.id}</td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{p.winnerName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.phone}</div></td>
                      <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{p.itemDescription || p.auction || "—"}</td>
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
          <Pagination page={safePage} totalPages={totalPages} total={sorted.length} onChange={setPageNum} />
        </>
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

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview confirmation" wide>
        {previewLoading ? (
          <div style={{ fontSize: 13, color: "var(--text-3)", padding: "20px 0" }}>Loading preview…</div>
        ) : previewError ? (
          <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md">{previewError}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 420, overflowY: "auto" }}>
            {previewItems.map((item) => (
              <div key={item.id} className="bg-[color:var(--paper)] border border-[color:var(--border)] rounded-[8px] p-3">
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{item.id} — {item.name}</div>
                <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 3 }}>Visitor SMS</div>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, fontFamily: "inherit", margin: "0 0 10px", color: "var(--text-2)" }}>{item.visitorMessage}</pre>
                {item.guideMessage && (
                  <>
                    <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 3 }}>Guide SMS</div>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, fontFamily: "inherit", margin: 0, color: "var(--text-2)" }}>{item.guideMessage}</pre>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button
            className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--brass)] text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={previewLoading || !!previewError || confirmSending}
            onClick={sendConfirmationSelected}
          >
            {confirmSending ? "Sending…" : `Send to ${previewItems.length} record${previewItems.length === 1 ? "" : "s"}`}
          </button>
          <button
            className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-transparent cursor-pointer"
            onClick={() => setPreviewOpen(false)}
          >
            Cancel
          </button>
        </div>
      </Modal>

      <RowDetail title={viewing ? `${viewing.id}` : ""} fields={viewing && [
          ["Winner", viewing.winnerName], ["Phone", viewing.phone], ["Auction", viewing.auction],
          ["Payment ref", viewing.paymentReference],
          ["Guide", viewing.guideName], ["Guide phone", viewing.guidePhone],
          ["Address", viewing.address], ["Map link", viewing.mapsLink],
          ["Quantity", viewing.quantity], ["Verification", viewing.verificationStatus],
          ["Status", viewing.status], ["Item", viewing.itemDescription, true],
        ]}
        onClose={() => setViewing(null)}
        onEdit={canEdit && viewing ? () => { const r = viewing; setViewing(null); openEdit(r); } : undefined} />

      <ConfirmDialog pending={pending} onCancel={cancel} onConfirm={run} />
    </div>
  );
}