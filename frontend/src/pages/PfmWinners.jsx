import { useState, useEffect } from "react";
import { PFM_STAMP } from "../constants/lookups";
import { fmtDate } from "../utils/format";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { pfm as pfmApi } from "../api";
import { isValidEthiopianPhone, PHONE_HINT } from "../utils/validation";

const TH = "text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]";
const TD = "py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]";
const BTN = "font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] disabled:opacity-40 disabled:cursor-not-allowed";
const BTN_PRIMARY = BTN + " bg-[color:var(--brass)] text-white border-[color:var(--brass)]";
const BTN_SM = "font-sans text-xs font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const ERR = "bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md";

// Per-row state in the preview modal, decided server-side by _pfm_row_state.
const STATE_STAMP = { new: "blue", duplicate: "gray", invalid: "red" };
const emptySched = { pickupDate: "", pickupTime: "", guideName: "", guidePhone: "", address: "", mapsLink: "", quantity: "" };

export default function PfmWinners({ setPickups, addAudit, canEdit }) {
  const [winners, setWinners] = useState([]);
  const [fStatus, setFStatus] = useState("New");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sel = useRowSelection((w) => w.id);

  const [prevOpen, setPrevOpen] = useState(false);
  const [since, setSince] = useState("");
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevRows, setPrevRows] = useState([]);
  const [prevPick, setPrevPick] = useState(new Set());
  const [prevError, setPrevError] = useState("");
  const [importing, setImporting] = useState(false);

  const [schedTarget, setSchedTarget] = useState(null);
  const [sched, setSched] = useState(emptySched);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedError, setSchedError] = useState("");

  async function load() {
    try { setWinners((await pfmApi.listWinners()) || []); } catch (e) { setError(e.body?.message || "Couldn't load winners."); }
  }
  useEffect(() => { load(); }, []);

  const shown = winners.filter((w) => fStatus === "All" || w.status === fStatus);

  async function runPreview() {
    setPrevLoading(true); setPrevError(""); setPrevRows([]); setPrevPick(new Set());
    try {
      const { rows } = await pfmApi.preview(since);
      setPrevRows(rows);
      // Pre-tick only the importable ones; duplicates/invalids are shown for
      // context but must never be selectable.
      setPrevPick(new Set(rows.filter((r) => r.state === "new").map((r) => r.invoiceNumber)));
    } catch (e) { setPrevError(e.body?.message || "Couldn't reach PFM."); }
    finally { setPrevLoading(false); }
  }
  function openPreview() { setPrevOpen(true); runPreview(); }
  function togglePick(inv) {
    setPrevPick((p) => { const n = new Set(p); n.has(inv) ? n.delete(inv) : n.add(inv); return n; });
  }
  async function doImport() {
    setImporting(true); setPrevError("");
    try {
      const res = await pfmApi.importWinners([...prevPick], since);
      addAudit("Import PFM winners", "—", `${res.imported.length} imported`, res.imported.join(", ").slice(0, 150));
      setNotice(`${res.imported.length} imported${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}.`);
      setPrevOpen(false); await load();
    } catch (e) { setPrevError(e.body?.message || "Import failed — try again."); }
    finally { setImporting(false); }
  }

  async function skipSelected() {
    const rows = sel.selectedFrom(shown).filter((w) => w.status !== "Scheduled");
    if (!rows.length) return;
    setError("");
    try {
      await Promise.all(rows.map((w) => pfmApi.toggleSkip(w.id)));
      sel.clear(); await load();
    } catch (e) { setError(e.body?.message || "Couldn't update."); }
  }

  function openSchedule() {
    const rows = sel.selectedFrom(shown);
    if (rows.length !== 1 || rows[0].status === "Scheduled") return;
    setSchedTarget(rows[0]); setSched(emptySched); setSchedError("");
  }
  async function saveSchedule() {
    if (!sched.pickupDate || !sched.pickupTime) { setSchedError("Pickup date and time are required."); return; }
    if (sched.guidePhone && !isValidEthiopianPhone(sched.guidePhone)) { setSchedError(`Guide phone isn't valid. ${PHONE_HINT}`); return; }
    setSchedSaving(true); setSchedError("");
    try {
      const { pickup } = await pfmApi.schedulePickup(schedTarget.id, sched);
      setPickups((prev) => [pickup, ...prev]);
      addAudit("Schedule pickup from PFM", schedTarget.invoiceNumber, pickup.id, pickup.winnerName);
      setSchedTarget(null); sel.clear(); await load();
    } catch (e) { setSchedError(e.body?.message || "Couldn't schedule — try again."); }
    finally { setSchedSaving(false); }
  }

  return (
    <div>
      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-3.5 flex flex-wrap gap-2 items-center mb-4">
        <select className="font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          {["New", "Scheduled", "Skipped", "All"].map((s) => <option key={s}>{s}</option>)}
        </select>
        {canEdit && <button className={BTN_PRIMARY} style={{ marginLeft: "auto" }} onClick={openPreview}>Import from PFM</button>}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className={BTN_SM} disabled={sel.selectedCount !== 1} onClick={openSchedule}>Schedule pickup</button>
          <button className={BTN_SM} disabled={!sel.selectedCount} onClick={skipSelected}>Skip / unskip</button>
        </BulkActionBar>
      )}
      {error && <div className={ERR} style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="bg-[color:var(--green-bg)] text-[color:var(--green)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{notice}</div>}

      {shown.length === 0 ? <EmptyState text="No winners here. Use “Import from PFM”." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group">
                {canEdit && <HeaderCheckbox checked={sel.isAllSelected(shown)} onChange={() => sel.toggleAll(shown)} />}
                <th className={TH}>Invoice</th><th className={TH}>Winner</th><th className={TH}>Auction / lots</th>
                <th className={TH}>Paid</th><th className={TH}>Verified</th><th className={TH}>Status</th>
              </tr></thead>
              <tbody>
                {shown.map((w) => (
                  <tr key={w.id} className="group">
                    {canEdit && <RowCheckbox checked={sel.isSelected(w)} onChange={() => sel.toggle(w)} label={`Select ${w.invoiceNumber}`} />}
                    <td className={TD + " font-mono"}>{w.invoiceNumber}</td>
                    <td className={TD}>{w.bidderName || w.companyName}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{w.phone}{w.bidderName && w.companyName ? ` · ${w.companyName}` : ""}</div></td>
                    <td className={TD}>{w.auction || "—"}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{w.lotsSummary}</div></td>
                    <td className={TD + " font-mono"}>{w.amountPaid || "—"}</td>
                    <td className={TD + " font-mono"}>{w.verifiedAt ? fmtDate(w.verifiedAt.slice(0, 10)) : "—"}</td>
                    <td className={TD}><Stamp text={w.status} kind={PFM_STAMP[w.status]} />{w.pickupId && <div className="font-mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{w.pickupId}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={prevOpen} onClose={() => setPrevOpen(false)} title="Import verified winners from PFM" wide>
        <div className="flex gap-2 items-end mb-3">
          <Field label="Only verified since (optional)"><input type="date" className={inputCls} value={since} onChange={(e) => setSince(e.target.value)} /></Field>
          <button className={BTN} onClick={runPreview} disabled={prevLoading}>{prevLoading ? "Checking…" : "Refresh"}</button>
        </div>
        {prevError && <div className={ERR} style={{ marginBottom: 10 }}>{prevError}</div>}
        {!prevLoading && !prevError && prevRows.length === 0 && <EmptyState text="PFM has no verified winners for this range." />}
        {prevRows.length > 0 && (
          <div style={{ maxHeight: 360, overflowY: "auto" }} className="border border-[color:var(--border)] rounded-[8px]">
            {prevRows.map((r) => (
              <label key={r.invoiceNumber} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px", borderBottom: "1px solid var(--border)", fontSize: 13, opacity: r.state === "new" ? 1 : 0.6 }}>
                <input type="checkbox" disabled={r.state !== "new"} checked={prevPick.has(r.invoiceNumber)} onChange={() => togglePick(r.invoiceNumber)} style={{ marginTop: 3 }} />
                <span style={{ flex: 1 }}>
                  <b className="font-mono">{r.invoiceNumber}</b> — {r.bidderName || r.companyName || "?"} · {r.phone}
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{r.auction} {r.lotsSummary} {r.amountPaid && `· paid ${r.amountPaid}`}</div>
                  {r.reason && <div style={{ fontSize: 11.5, color: "var(--red)" }}>{r.reason}</div>}
                </span>
                <Stamp text={r.state} kind={STATE_STAMP[r.state]} />
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className={BTN_PRIMARY} disabled={!prevPick.size || importing} onClick={doImport}>{importing ? "Importing…" : `Import ${prevPick.size} winner${prevPick.size === 1 ? "" : "s"}`}</button>
          <button className={BTN + " bg-transparent"} onClick={() => setPrevOpen(false)}>Cancel</button>
        </div>
      </Modal>

      <Modal open={!!schedTarget} onClose={() => setSchedTarget(null)} title={schedTarget ? `Schedule pickup — ${schedTarget.invoiceNumber}` : ""}>
        {schedTarget && (<>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 12 }}>{schedTarget.bidderName || schedTarget.companyName} · {schedTarget.phone} · {schedTarget.lotsSummary}</div>
          <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
            <Field label="Pickup date"><input type="date" className={inputCls} value={sched.pickupDate} onChange={(e) => setSched({ ...sched, pickupDate: e.target.value })} /></Field>
            <Field label="Pickup time"><input type="time" className={inputCls} value={sched.pickupTime} onChange={(e) => setSched({ ...sched, pickupTime: e.target.value })} /></Field>
            <Field label="Guide name (optional)"><input className={inputCls} value={sched.guideName} onChange={(e) => setSched({ ...sched, guideName: e.target.value })} /></Field>
            <Field label="Guide phone (optional)"><input className={inputCls} value={sched.guidePhone} onChange={(e) => setSched({ ...sched, guidePhone: e.target.value })} /></Field>
            <Field label="Address (optional)"><input className={inputCls} value={sched.address} onChange={(e) => setSched({ ...sched, address: e.target.value })} /></Field>
            <Field label="Quantity (optional)"><input className={inputCls} value={sched.quantity} onChange={(e) => setSched({ ...sched, quantity: e.target.value })} /></Field>
            <Field label="Google Maps link (optional)" full><input className={inputCls} value={sched.mapsLink} onChange={(e) => setSched({ ...sched, mapsLink: e.target.value })} /></Field>
          </div>
          {schedError && <div className={ERR}>{schedError}</div>}
          <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
            <button className={BTN_PRIMARY} disabled={schedSaving} onClick={saveSchedule}>{schedSaving ? "Saving…" : "Create pickup"}</button>
            <button className={BTN + " bg-transparent"} onClick={() => setSchedTarget(null)}>Cancel</button>
          </div>
        </>)}
      </Modal>
    </div>
  );
}
