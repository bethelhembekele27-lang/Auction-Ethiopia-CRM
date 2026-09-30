import { useState, useMemo } from "react";
import { VERIFICATION_STAMP } from "../constants/lookups";
import { fmtWindow } from "../utils/format";
import { Stamp, Field, Modal, EmptyState, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { isSetupOpen } from "./VisitSetups";
import { appointments as appointmentsApi, followups as followupsApi } from "../api";
import { EditIcon, DeleteIcon, PlusIcon, SendIcon } from "../components/icons";
import { useConfirm } from "../hooks/useConfirm";
import AutoCompleteField from "../components/AutoCompleteField";
import LocationFields, { useSavedLocations } from "../components/LocationFields";
import ConfirmDialog from "../components/ConfirmDialog";
import { isValidEthiopianPhone, PHONE_HINT } from "../utils/validation";
import { getRecentUniqueOptions } from "../utils/recentOptions";

// No visitDate/visitTime/status here on purpose: the visit window comes from the
// chosen Visit Setup, and Status is no longer used. setupIds is UI-only.
export const emptyAppt = {
  id: "", auction: "", visitorName: "", phone: "", company: "", assignedStaff: "", notes: "",
  setupId: "", batch: "", guideName: "", guidePhone: "", address: "", items: "", quantity: "",
  mapsLink: "", isCustom: false, setupIds: [],
};

const TH = "text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]";
const TD = "py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]";
const FILTER = "font-sans text-[13px] px-2.5 py-2 border border-[color:var(--border)] rounded-[5px] bg-[color:var(--panel)] text-[color:var(--text)]";
const BTN = "font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]";
const BTN_PRIMARY = BTN + " bg-[color:var(--brass)] text-white border-[color:var(--brass)]";
const BTN_GHOST = BTN + " bg-transparent";
const BTN_SM = "font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label";
const BTN_DANGER_SM = "font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] btn-danger-outline cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label";
const LABEL = "block mb-1 text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)]";
const ERR = "bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md";

const pick = (d) => ({
  auction: d.auction, visitorName: d.visitorName, phone: d.phone, company: d.company,
  assignedStaff: d.assignedStaff, notes: d.notes, setupId: d.setupId, batch: d.batch,
  guideName: d.guideName, guidePhone: d.guidePhone, address: d.address, items: d.items,
  quantity: d.quantity, mapsLink: d.mapsLink, isCustom: false,
});

export default function Visitations({ appointments, setAppointments, visitSetups, setFollowups, canEdit, addAudit, session }) {
  const [fCompany, setFCompany] = useState("All");
  const [fBatch, setFBatch] = useState("All");
  const [fGuide, setFGuide] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyAppt);
  const [modalCompanyFilter, setModalCompanyFilter] = useState("All");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [bulkError, setBulkError] = useState("");
  const sel = useRowSelection((a) => a.id);
  const { pending, confirm, cancel, run } = useConfirm();
  const loc = useSavedLocations();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewError, setPreviewError] = useState("");
  const [confirmSending, setConfirmSending] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(null);

  const nameOf = (a) => a.visitorName || a.phone;

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
      if (current) return [...openVisitSetups, current]; // keep editing a now-closed setup visible
    }
    return openVisitSetups;
  }, [openVisitSetups, visitSetups, draft.setupId]);

  const phoneOptions = useMemo(
    () => getRecentUniqueOptions(appointments, (a) => a.phone, (a) => a.createdAt, 30),
    [appointments]
  );

  const filtered = appointments.filter((a) => {
    if (fCompany !== "All" && a.company !== fCompany) return false;
    if (fBatch !== "All" && a.batch !== fBatch) return false;
    if (fGuide !== "All" && a.guideName !== fGuide) return false;
    return true;
  });
  // Newest registration first. visitDate can't sort these anymore — it's null
  // for setup-backed and custom visits, and the real dates live on the setup.
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const modalSetupCompanyOptions = useMemo(() => [...new Set(setupOptions.map((v) => v.company))], [setupOptions]);
  const setupsForModal = useMemo(
    () => setupOptions.filter((v) => modalCompanyFilter === "All" || v.company === modalCompanyFilter),
    [setupOptions, modalCompanyFilter]
  );
  const selectedSetupsDetail = draft.setupIds.map((id) => visitSetups.find((v) => v.id === id)).filter(Boolean);
  const selectedSetup = visitSetups.find((v) => v.id === draft.setupId);

  /* ---------- preview / send ---------- */
  async function openPreview() {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    setPreviewOpen(true); setPreviewLoading(true); setPreviewError("");
    try {
      const results = await Promise.all(
        rows.map((a) => appointmentsApi.previewConfirmation(a.id).then((r) => ({ ...r, name: nameOf(a) })))
      );
      setPreviewItems(results);
    } catch (err) {
      setPreviewError(err.body?.message || "Couldn't load preview — try again.");
    } finally { setPreviewLoading(false); }
  }

  async function sendConfirmationSelected() {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    setConfirmSending(true); setConfirmNotice(null);
    try {
      const { results } = await appointmentsApi.sendConfirmationBulk(rows.map((a) => a.id));
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      results.forEach((r) => {
        const row = rows.find((a) => a.id === r.id);
        if (!row || !r.ok) return;
        if (r.isCustom) {
          loc.persist(row.address, row.mapsLink, "once"); // quiet upsert, fail soft
          addAudit("Send visitation confirmation", "—", r.id, `${nameOf(row)} · custom visit (no pass) · visitor ${r.visitor.status}`);
        } else {
          const guidePart = r.guide ? `, guide ${r.guide.status}` : ", no guide phone on file — guide SMS skipped";
          addAudit("Send visitation confirmation", "—", r.id, `${nameOf(row)} · visitor ${r.visitor.status}${guidePart}`);
        }
      });
      setConfirmNotice({
        kind: failCount ? "error" : "ok",
        text: failCount
          ? `${okCount} sent, ${failCount} failed. Check individual records for details.`
          : `Confirmation sent for ${okCount} record${okCount === 1 ? "" : "s"}.`,
      });
      setPreviewOpen(false); sel.clear();
    } catch (err) {
      setConfirmNotice({ kind: "error", text: err.body?.message || "Couldn't send confirmation — try again." });
    } finally { setConfirmSending(false); }
  }

  async function bulkDelete() {
    const rows = sel.selectedFrom(sorted);
    if (!rows.length) return;
    confirm(`Permanently delete ${rows.length} visitation(s)? This cannot be undone.`, async () => {
      setBulkError("");
      try {
        await Promise.all(rows.map((a) => appointmentsApi.deleteAppointment(a.id)));
        setAppointments((prev) => prev.filter((a) => !rows.some((r) => r.id === a.id)));
        rows.forEach((a) => addAudit("Delete visitation", `${a.id} · ${nameOf(a)}`, "—", "Permanently removed"));
        sel.clear();
      } catch (err) {
        setBulkError(err.body?.message || "Couldn't delete one or more visitations — try again.");
      }
    });
  }

  /* ---------- modal open/close helpers ---------- */
  function openNew() {
    setEditing(null); setDraft({ ...emptyAppt, setupIds: [] });
    setModalCompanyFilter("All"); loc.setChoice("once"); setSaveError(""); setModalOpen(true);
  }
  function openEdit(a) {
    setEditing(a.id);
    setDraft({ ...emptyAppt, ...a, setupIds: a.setupId ? [a.setupId] : [] });
    setModalCompanyFilter(a.company || "All"); loc.setChoice("once"); setSaveError(""); setModalOpen(true);
  }
  function openEditSelected() {
    const rows = sel.selectedFrom(sorted);
    if (rows.length === 1) openEdit(rows[0]);
  }

  // Edit mode: single setup dropdown
  function applySetup(setupId) {
    const s = visitSetups.find((v) => v.id === setupId);
    if (!s) { setDraft((d) => ({ ...d, setupId: "" })); return; }
    setDraft((d) => ({
      ...d, setupId: s.id, company: s.company, batch: s.batch, guideName: s.guideName,
      guidePhone: s.guidePhone, address: s.address, mapsLink: s.mapsLink || "", items: s.items,
      assignedStaff: s.guideName,
    }));
  }

  // New mode: multi-select, exclusive with Custom
  function toggleSetupSelection(setupId) {
    setDraft((d) => {
      const base = d.isCustom ? { ...d, isCustom: false, address: "", mapsLink: "" } : d;
      const already = base.setupIds.includes(setupId);
      const setupIds = already ? base.setupIds.filter((id) => id !== setupId) : [...base.setupIds, setupId];
      const last = setupIds.length ? visitSetups.find((v) => v.id === setupIds[setupIds.length - 1]) : null;
      return {
        ...base, setupIds,
        setupId: last ? last.id : "",
        company: last ? last.company : base.company,
        batch: last ? last.batch : base.batch,
        guideName: last ? last.guideName : base.guideName,
        guidePhone: last ? last.guidePhone : base.guidePhone,
        address: last ? last.address : base.address,
        mapsLink: last ? (last.mapsLink || "") : base.mapsLink,
        items: last ? last.items : base.items,
      };
    });
  }

  function toggleCustom() {
    setDraft((d) =>
      d.isCustom
        ? { ...d, isCustom: false, address: "", mapsLink: "" }
        : { ...emptyAppt, isCustom: true, phone: d.phone, setupIds: [] }
    );
    loc.setChoice("once");
  }

  /* ---------- save ---------- */
  async function save() {
    if (!isValidEthiopianPhone(draft.phone)) {
      setSaveError(`Phone number isn't valid. ${PHONE_HINT}`); return;
    }
    if (draft.isCustom) {
      if (!draft.address.trim()) { setSaveError("Place name / address is required."); return; }
      if (!draft.mapsLink.trim()) { setSaveError("Google Maps link is required."); return; }
    } else {
      if (!draft.visitorName.trim()) { setSaveError("Visitor name is required."); return; }
      if (!editing && !draft.setupIds.length) { setSaveError("Pick at least one visit setup, or choose Custom."); return; }
    }

    setSaving(true); setSaveError("");
    try {
      if (draft.isCustom) {
        const payload = { isCustom: true, visitorName: "", phone: draft.phone, address: draft.address.trim(), mapsLink: draft.mapsLink.trim() };
        if (editing) {
          const updated = await appointmentsApi.updateAppointment(editing, payload);
          setAppointments((prev) => prev.map((a) => (a.id === editing ? { ...a, ...updated } : a)));
        } else {
          const created = await appointmentsApi.createAppointment(payload);
          setAppointments((prev) => [created, ...prev]);
          addAudit("Register custom visitor", "—", `${created.id} created`, `${created.phone} · ${created.address}`);
        }
        await loc.persist(payload.address, payload.mapsLink, loc.choice);
      } else if (editing) {
        const updated = await appointmentsApi.updateAppointment(editing, pick(draft));
        setAppointments((prev) => prev.map((a) => (a.id === editing ? { ...a, ...updated } : a)));
        addAudit("Edit visitation", "—", editing, nameOf(draft));
      } else {
        const created = [];
        for (const setupId of draft.setupIds) {
          const s = visitSetups.find((v) => v.id === setupId);
          if (!s) continue;
          created.push(await appointmentsApi.createAppointment({
            ...pick(draft), setupId: s.id, company: s.company, batch: s.batch, guideName: s.guideName,
            guidePhone: s.guidePhone, address: s.address, mapsLink: s.mapsLink || "", items: s.items,
            assignedStaff: s.guideName,
          }));
        }
        setAppointments((prev) => [...created, ...prev]);
        addAudit("Register visitor", "—", `${created.map((c) => c.id).join(", ")} created`,
          `${draft.visitorName} · ${created.map((c) => c.batch).join(", ")}`);
        // The backend created one follow-up per appointment server-side; refetch
        // rather than hand-rolling them here so the dates match the server's rule.
        try { setFollowups((await followupsApi.listFollowups()) || []); } catch { /* non-fatal */ }
      }
      setModalOpen(false); sel.clear();
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save — try again.");
    } finally { setSaving(false); }
  }

  const multi = draft.setupIds.length > 1;

  return (
    <div>
      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-3.5 flex flex-wrap gap-2 items-center mb-4">
        <select className={FILTER} value={fCompany} onChange={(e) => { setFCompany(e.target.value); setFBatch("All"); }}>
          <option value="All">All companies</option>{companyOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={FILTER} value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
          <option value="All">All batches</option>{batchOptions.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select className={FILTER} value={fGuide} onChange={(e) => setFGuide(e.target.value)}>
          <option value="All">All guides</option>{guideOptions.map((g) => <option key={g}>{g}</option>)}
        </select>
        {(fCompany !== "All" || fBatch !== "All" || fGuide !== "All") && (
          <button className={BTN_GHOST + " px-2.5 py-[5px] text-xs"} onClick={() => { setFCompany("All"); setFBatch("All"); setFGuide("All"); }}>Clear filters</button>
        )}
        {canEdit && (
          <button className={BTN_PRIMARY + " btn-icon-label"} style={{ marginLeft: "auto" }} onClick={openNew}>
            <PlusIcon /><span>Register visitor</span>
          </button>
        )}
      </div>

      {canEdit && (
        <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
          <button className={BTN_SM} disabled={sel.selectedCount !== 1} onClick={openEditSelected}><EditIcon /><span>Edit</span></button>
          <button className={BTN_SM} disabled={!sel.selectedCount} onClick={openPreview}><SendIcon /><span>Send confirmation</span></button>
          {session && ["administrator", "auction_manager"].includes(session.role) && (
            <button className={BTN_DANGER_SM} disabled={!sel.selectedCount} onClick={bulkDelete}><DeleteIcon /><span>Delete</span></button>
          )}
        </BulkActionBar>
      )}
      {bulkError && <div className={ERR} style={{ marginBottom: 12 }}>{bulkError}</div>}
      {confirmNotice && (
        <div className={confirmNotice.kind === "ok"
          ? "bg-[color:var(--green-bg)] text-[color:var(--green)] text-[12.5px] px-3 py-2 rounded-md" : ERR}
          style={{ marginBottom: 12 }}>{confirmNotice.text}</div>
      )}

      {sorted.length === 0 ? <EmptyState text="No visitations found." /> : (
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-[13px] min-w-[640px]">
              <thead><tr className="group">
                {canEdit && <HeaderCheckbox checked={sel.isAllSelected(sorted)} onChange={() => sel.toggleAll(sorted)} />}
                <th className={TH}>ID</th><th className={TH}>Visitor</th><th className={TH}>Company / Batch</th>
                <th className={TH}>Visit window</th><th className={TH}>Guide</th><th className={TH}>Verification</th>
              </tr></thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id} className="group">
                    {canEdit && <RowCheckbox checked={sel.isSelected(a)} onChange={() => sel.toggle(a)} label={`Select ${a.id}`} />}
                    <td className={TD + " font-mono"}>{a.id}</td>
                    <td className={TD}>
                      {nameOf(a)}
                      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                        {a.visitorName ? a.phone : ""}{a.isCustom ? `${a.visitorName ? " · " : ""}Custom — ID only` : ""}
                      </div>
                    </td>
                    <td className={TD}>
                      {a.isCustom ? (
                        a.mapsLink
                          ? <a href={a.mapsLink} target="_blank" rel="noreferrer" className="text-[color:var(--blue)] underline underline-offset-2">{a.address}</a>
                          : a.address
                      ) : (<>{a.company}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.batch}</div></>)}
                    </td>
                    <td className={TD + " font-mono"}>{a.isCustom ? "—" : fmtWindow(a.visitWindow)}</td>
                    <td className={TD}>
                      {a.isCustom ? "—" : (<>{a.guideName || a.assignedStaff}<div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.guidePhone}</div></>)}
                    </td>
                    <td className={TD}><Stamp text={a.verificationStatus || "Not sent"} kind={VERIFICATION_STAMP[a.verificationStatus] || "gray"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing}` : "Register visitor"} wide>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
          {editing && !draft.isCustom && (
            <>
              <Field label="Auction visit setup" full>
                <select className={inputCls} value={draft.setupId} onChange={(e) => applySetup(e.target.value)}>
                  <option value="">Select company / batch / guide…</option>
                  {setupOptions.map((v) => <option key={v.id} value={v.id}>{v.company} — {v.batch} — Guide: {v.guideName}</option>)}
                </select>
              </Field>
              {selectedSetup && (
                <div className="col-span-2" style={{ fontSize: 12.5, color: "var(--text-2)", background: "var(--paper)", borderRadius: 6, padding: "8px 10px" }}>
                  <b>{selectedSetup.address}</b>{selectedSetup.mapsLink ? " (map link set)" : ""} — {selectedSetup.items}<br />
                  Guide {selectedSetup.guideName} ({selectedSetup.guidePhone}), {selectedSetup.guideTimeFrom}–{selectedSetup.guideTimeTo}
                </div>
              )}
            </>
          )}

          {!editing && (
            <div className="col-span-2">
              <div className={LABEL}>Auction visit setup(s)</div>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 12px", marginBottom: 8, cursor: "pointer", fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, background: draft.isCustom ? "var(--brass-bg)" : "var(--paper)" }}>
                <input type="checkbox" checked={draft.isCustom} onChange={toggleCustom} style={{ marginTop: 2 }} />
                <span><b>Custom — ID only (no guide)</b>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Visitor just shows an ID. Gets one SMS with the place and map link — no pass, QR or follow-up.</div>
                </span>
              </label>
              <select className={inputCls} value={modalCompanyFilter} onChange={(e) => setModalCompanyFilter(e.target.value)} style={{ marginBottom: 8 }}>
                <option value="All">All companies</option>
                {modalSetupCompanyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 190, overflowY: "auto", background: "var(--paper)" }}>
                {setupsForModal.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12.5, color: "var(--text-3)", fontStyle: "italic" }}>No open batches for this company.</div>
                ) : setupsForModal.map((v) => (
                  <label key={v.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={draft.setupIds.includes(v.id)} onChange={() => toggleSetupSelection(v.id)} style={{ marginTop: 2 }} />
                    <span><b>{v.company}</b> — {v.batch}
                      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Guide: {v.guideName} ({v.guidePhone}) · {v.address}</div>
                    </span>
                  </label>
                ))}
              </div>
              {selectedSetupsDetail.length > 0 && (
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                  {selectedSetupsDetail.map((v) => (
                    <span key={v.id} className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] px-2 py-1 rounded-[4px] text-[color:var(--brass-dark)] bg-[color:var(--brass-bg)]">
                      {v.company} — {v.batch}
                      <button type="button" onClick={() => toggleSetupSelection(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, padding: 0, marginLeft: 2 }} aria-label={`Remove ${v.batch}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {draft.isCustom ? (
            <>
              <Field label="Phone number" full>
                <AutoCompleteField value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} options={phoneOptions} placeholder="Choose a past visitor or type a new number" />
              </Field>
              <LocationFields loc={loc} addressLabel="Place name / address" address={draft.address} mapsLink={draft.mapsLink}
                onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
            </>
          ) : (
            <>
              <Field label="Visitor name"><input className={inputCls} value={draft.visitorName} onChange={(e) => setDraft({ ...draft, visitorName: e.target.value })} /></Field>
              <Field label="Phone number">
                <AutoCompleteField value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} options={phoneOptions} placeholder="Choose a past visitor or type a new number" />
              </Field>
              <Field label="Quantity (optional)"><input className={inputCls} placeholder="e.g. 1, or 3 lots" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></Field>
              <Field label="Notes" full><textarea className={inputCls} rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
            </>
          )}
        </div>

        {!editing && (
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            {draft.isCustom
              ? "Custom visits get one SMS (place + map link). No guide, pass, QR or follow-up."
              : multi
                ? `This creates ${draft.setupIds.length} visitation records (one per batch). Each gets a follow-up dated 3 days before its setup's end date.`
                : "The visitor can come any time in the setup's date range. A follow-up is added 3 days before the range ends."}
          </div>
        )}
        {saveError && <div className={ERR} style={{ marginTop: 10 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className={BTN_PRIMARY} disabled={saving} onClick={save}>
            {saving ? "Saving…" : editing ? "Save changes" : multi ? `Register for ${draft.setupIds.length} batches` : "Register visitor"}
          </button>
          <button className={BTN_GHOST} onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview confirmation" wide>
        {previewLoading ? (
          <div style={{ fontSize: 13, color: "var(--text-3)", padding: "20px 0" }}>Loading preview…</div>
        ) : previewError ? (
          <div className={ERR}>{previewError}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 420, overflowY: "auto" }}>
            {previewItems.map((item) => (
              <div key={item.id} className="bg-[color:var(--paper)] border border-[color:var(--border)] rounded-[8px] p-3">
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{item.id} — {item.name}</div>
                <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 3 }}>Visitor SMS</div>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, fontFamily: "inherit", margin: "0 0 10px", color: "var(--text-2)" }}>{item.visitorMessage}</pre>
                {item.guideMessage && (<>
                  <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 3 }}>Guide SMS</div>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, fontFamily: "inherit", margin: 0, color: "var(--text-2)" }}>{item.guideMessage}</pre>
                </>)}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--brass)] text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={previewLoading || !!previewError || confirmSending} onClick={sendConfirmationSelected}>
            {confirmSending ? "Sending…" : `Send to ${previewItems.length} record${previewItems.length === 1 ? "" : "s"}`}
          </button>
          <button className={BTN_GHOST} onClick={() => setPreviewOpen(false)}>Cancel</button>
        </div>
      </Modal>

      <ConfirmDialog pending={pending} onCancel={cancel} onConfirm={run} />
    </div>
  );
}
