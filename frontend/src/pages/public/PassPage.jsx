import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { getPass, verifyPass } from "../../api/verification";
import { logo } from "../../constants/assets";

// Serves BOTH /v/:token (visitor) and /g/:token (guide) — the payload's
// `role` field (set server-side from which token matched) tells this
// component which side it's rendering, so there's no need for two
// near-duplicate components.
//
// QR is rendered CLIENT-SIDE from `data.ownToken` (see backend
// verification.py's Phase 2 docstring for why — avoids a Pillow
// dependency on the Django backend for no real benefit here).
export default function PassPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef(null);

  useEffect(() => {
    getPass(token)
      .then(setData)
      .catch((e) => setError(e.body?.message || "This link is invalid or has expired."));
  }, [token]);

  // QR generation notes (fixes the "speckled/dotted" look reported on
  // both phone and desktop): generate at the EXACT display size, with a
  // proper quiet-zone margin and a fixed dark/light palette, and disable
  // browser smoothing on the <img> itself (imageRendering: 'pixelated').
  const QR_SIZE = 196;
  useEffect(() => {
    if (data?.ownToken) {
      QRCode.toDataURL(data.ownToken, {
        width: QR_SIZE,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#14171C", light: "#FFFFFF" },
      })
        .then(setQrDataUrl)
        .catch(() => {});
    }
  }, [data]);

  async function submitScan(scannedValue) {
    try {
      const res = await verifyPass({ scannedToken: scannedValue, ownToken: token, ownRole: data.role });
      setVerifyMsg(`${res.verifiedRole === "guide" ? "Guide" : "Visitor"} verified successfully.`);
      const refreshed = await getPass(token);
      setData(refreshed);
    } catch (e) {
      setVerifyMsg(e.body?.message || "Verification failed.");
    }
  }

  async function startScan() {
    setScanning(true);
    setVerifyMsg("");
    setTimeout(async () => {
      const elId = "qr-reader";
      if (!document.getElementById(elId)) { setScanning(false); return; }
      const scanner = new Html5Qrcode(elId);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          async (decoded) => {
            try { await scanner.stop(); } catch { /* already stopped */ }
            setScanning(false);
            submitScan(decoded);
          },
          () => {}
        );
      } catch {
        setVerifyMsg("Couldn't access the camera — use the 6-digit code below instead.");
        setScanning(false);
      }
    }, 50);
  }

  function stopScan() {
    scannerRef.current?.stop().catch(() => {});
    setScanning(false);
  }

  /* ============================================================
     ICONS — small, inline, single-color (currentColor) so they pick
     up whatever text color wraps them. Kept local to this file since
     they're specific to pass-page details (calendar/clock/box/tag/etc)
     and aren't reused elsewhere in the CRM yet.
  ============================================================ */
  const ic = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const MapPinIcon = (p) => (
    <svg width="13" height="13" viewBox="0 0 24 24" {...ic} {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
  );
  const CalendarIcon = (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" {...ic} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
  );
  const ClockIcon = (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" {...ic} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  );
  const TagIcon = (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" {...ic} {...p}><path d="M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.3" fill="currentColor" stroke="none" /></svg>
  );
  const BoxIcon = (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" {...ic} {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
  );
  const UserIcon = (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" {...ic} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4.5 5-6 8-6s6.5 1.5 8 6" /></svg>
  );
  const PhoneIcon = (p) => (
    <svg width="12" height="12" viewBox="0 0 24 24" {...ic} {...p}><path d="M5 4h4l1.5 5-2.5 1.5a13 13 0 0 0 6 6L15.5 14l5 1.5V19a2 2 0 0 1-2 2C10.5 21 3 13.5 3 6a2 2 0 0 1 2-2Z" /></svg>
  );
  const ShieldIcon = (p) => (
    <svg width="14" height="14" viewBox="0 0 24 24" {...ic} {...p}><path d="M12 2l8 3.5v6C20 16.5 16.5 20.5 12 22 7.5 20.5 4 16.5 4 11.5v-6L12 2Z" /></svg>
  );
  const ShieldCheckIcon = (p) => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...ic} {...p}><path d="M12 2l8 3.5v6C20 16.5 16.5 20.5 12 22 7.5 20.5 4 16.5 4 11.5v-6L12 2Z" /><path d="m9 12 2 2 4-4" /></svg>
  );
  const CameraIcon = (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ic} {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="14" r="3.5" /></svg>
  );
  const AlertIcon = (p) => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...ic} {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
  );

  // Standalone page — outside the app shell, but index.css (Tailwind +
  // the app's --brass/--panel/etc CSS vars + Space Grotesk/Inter fonts)
  // is already loaded globally via main.jsx, so reuse the same design
  // language as the rest of the CRM rather than inventing a new one.
  const shellCls = "min-h-screen w-full bg-[color:var(--paper)] flex items-start justify-center py-10 px-4";
  const cardCls = "relative w-full max-w-[460px] bg-[color:var(--panel)] border border-[color:var(--border)] rounded-2xl shadow-[0_16px_40px_rgba(20,23,28,0.14)] overflow-hidden";

  // Ticket-style "perforated" divider between the details block and the
  // QR block — two page-colored notches punched into the card's edges
  // plus a dashed rule, mimicking a torn ticket stub.
  function TicketDivider() {
    return (
      <div className="relative -mx-6 my-6">
        <div className="absolute -left-[26px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[color:var(--paper)] border border-[color:var(--border)]" />
        <div className="absolute -right-[26px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[color:var(--paper)] border border-[color:var(--border)]" />
        <div className="border-t-2 border-dashed border-[color:var(--border)] mx-6" />
      </div>
    );
  }

  // A real rubber-stamp-style badge — CSS only (no image asset needed).
  // Used once verification succeeds, so the pass visually reads as
  // "officially confirmed" rather than just a small colored pill.
  function InkStamp({ label = "VERIFIED" }) {
    return (
      <div
        className="inline-flex items-center justify-center select-none shrink-0"
        style={{
          width: 92, height: 92, borderRadius: "50%",
          border: "3px solid var(--green)", transform: "rotate(-11deg)",
          color: "var(--green)", boxShadow: "0 0 0 3px var(--green-bg)",
        }}
      >
        <div className="text-center leading-tight">
          <ShieldCheckIcon className="mx-auto mb-0.5" />
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em" }}>{label}</div>
        </div>
      </div>
    );
  }

  function DetailRow({ icon, label, value }) {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
        <span className="mt-0.5 w-6 h-6 rounded-md bg-[color:var(--brass-bg)] text-[color:var(--brass-dark)] flex items-center justify-center shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.05em] text-[color:var(--text-3)] mb-0.5">{label}</div>
          <div className="text-[13.5px] text-[color:var(--text)] leading-[1.4] break-words">{value}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={shellCls}>
        <div className={cardCls + " p-8 text-center"}>
          <img src={logo} alt="Auction Ethiopia" className="h-10 w-auto mx-auto mb-5 opacity-90" />
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[color:var(--red-bg)] text-[color:var(--red)] mb-3">
            <AlertIcon />
          </div>
          <p className="font-display text-[15px] font-semibold text-[color:var(--text)]">{error}</p>
          <p className="text-[13px] text-[color:var(--text-3)] mt-1.5">If this looks wrong, ask the call center to resend your confirmation.</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={shellCls}>
        <div className="text-[13px] text-[color:var(--text-2)] flex items-center gap-2 mt-10">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-[color:var(--brass)] border-t-transparent animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  const s = data.subject;
  const isVisitor = data.role === "visitor";
  const otherRoleLabel = isVisitor ? "Guide" : "Visitor";

  return (
    <div className={shellCls}>
      <div className={cardCls}>
        {/* Brand accent bar */}
        <div className="h-[6px] bg-gradient-to-r from-[color:var(--brass)] via-[color:var(--brass-dark)] to-[color:var(--brass)]" />

        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-[color:var(--border)] bg-[color:var(--paper)]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <img src={logo} alt="Auction Ethiopia" className="h-9 w-auto" />
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-[10.5px] tracking-[0.06em] uppercase px-2.5 py-1 rounded-full border border-[color:var(--brass)] text-[color:var(--brass-dark)] bg-[color:var(--brass-bg)]">
              <ShieldIcon /> {isVisitor ? "Visitor Pass" : "Guide Pass"}
            </span>
          </div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-[color:var(--text)] m-0">
            {isVisitor ? "Visit pass" : "Guide verification"}
          </h1>
          <p className="text-[12.5px] text-[color:var(--text-2)] mt-0.5 mb-0">
            {s.company || "Auction Ethiopia (general)"}
          </p>
        </div>

        {/* Body */}
        <div className="relative px-6 py-5 overflow-hidden">
          <div className="relative z-10 bg-[color:var(--paper)] border border-[color:var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-[color:var(--border)]">
              <div className="w-10 h-10 rounded-full bg-[color:var(--brass)] text-white flex items-center justify-center shrink-0">
                <UserIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.05em] text-[color:var(--text-3)]">
                  {isVisitor ? "Visitor" : "Visitor to verify"}
                </div>
                <div className="font-display font-semibold text-[15.5px] text-[color:var(--text)] truncate">{s.visitorName}</div>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-mono text-[color:var(--text-2)] shrink-0">
                <PhoneIcon /> {s.phone}
              </span>
            </div>

            <div className="divide-y divide-[color:var(--border)]/60">
              <DetailRow icon={<TagIcon />} label="Auction" value={s.auction} />
              <DetailRow icon={<TagIcon />} label="Batch" value={s.batch} />
              <DetailRow icon={<BoxIcon />} label="Item(s)" value={s.items} />
              <DetailRow icon={<BoxIcon />} label="Quantity" value={s.quantity} />
              <DetailRow icon={<CalendarIcon />} label="Date & time" value={`${s.visitDate} · ${s.visitTime}`} />
              <DetailRow
                icon={<MapPinIcon />}
                label="Location"
                value={
                  <>
                    {s.address || "To be confirmed"}
                    {s.mapsLink && (
                      <>
                        {" "}
                        <a
                          href={s.mapsLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[color:var(--brass-dark)] font-semibold no-underline hover:underline underline-offset-2"
                        >
                          <MapPinIcon /> Open in Maps
                        </a>
                      </>
                    )}
                  </>
                }
              />
              {isVisitor && (
                <DetailRow
                  icon={<UserIcon />}
                  label="Assigned guide"
                  value={<>{s.guideName || "—"} {s.guidePhone && <span className="font-mono">({s.guidePhone})</span>}</>}
                />
              )}
            </div>
          </div>

          <TicketDivider />

          {/* Own QR + code */}
          <div className="relative z-10 text-center mb-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[color:var(--text-2)] mb-3 flex items-center justify-center gap-1.5">
              <ClockIcon /> Your code
            </div>
            {qrDataUrl && (
              <div className="inline-block p-3.5 bg-white border border-[color:var(--border)] rounded-xl shadow-[0_1px_3px_rgba(20,23,28,0.06)]">
                <img
                  src={qrDataUrl}
                  alt="QR code"
                  width={QR_SIZE}
                  height={QR_SIZE}
                  className="block"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            )}
            <div className="font-mono text-[26px] font-semibold tracking-[0.3em] text-[color:var(--text)] mt-3">
              {data.ownCode}
            </div>
            <p className="text-[12px] text-[color:var(--text-3)] mt-1">
              Show this to the {otherRoleLabel.toLowerCase()} to verify you.
            </p>
          </div>

          <div className="relative z-10 h-px bg-[color:var(--border)] mb-6" />

          {/* Verification status / scanner */}
          <div className="relative z-10">
          {data.otherVerified ? (
            <div className="flex items-center justify-center gap-4 bg-[color:var(--green-bg)] rounded-xl py-4 px-4">
              <InkStamp />
              <div className="text-left">
                <div className="text-[14px] font-semibold text-[color:var(--text)]">{otherRoleLabel} confirmed</div>
                <div className="text-[12px] text-[color:var(--text-2)] mt-0.5">Identity verified on-site.</div>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[color:var(--text-2)] mb-3 text-center">
                Scan the {otherRoleLabel.toLowerCase()}'s code
              </div>

              {!scanning ? (
                <button
                  onClick={startScan}
                  className="w-full font-sans text-[13.5px] font-semibold py-2.5 rounded-[8px] bg-[color:var(--brass)] text-white border border-[color:var(--brass)] cursor-pointer hover:bg-[color:var(--brass-dark)] hover:border-[color:var(--brass-dark)] shadow-[0_1px_2px_rgba(20,23,28,0.08)] transition-colors flex items-center justify-center gap-2"
                >
                  <CameraIcon /> Open camera
                </button>
              ) : (
                <button
                  onClick={stopScan}
                  className="w-full font-sans text-[13.5px] font-medium py-2.5 rounded-[8px] bg-[color:var(--panel)] text-[color:var(--text)] border border-[color:var(--border)] cursor-pointer hover:border-[color:var(--text-3)] transition-colors"
                >
                  Cancel scanning
                </button>
              )}

              <div id="qr-reader" className="w-full mt-3 rounded-xl overflow-hidden [&_video]:rounded-xl" />

              <div className="flex items-center gap-2 my-4">
                <div className="flex-1 h-px bg-[color:var(--border)]" />
                <span className="text-[10.5px] text-[color:var(--text-3)] uppercase tracking-[0.05em]">or enter manually</span>
                <div className="flex-1 h-px bg-[color:var(--border)]" />
              </div>

              <div className="flex gap-2">
                <input
                  maxLength={6}
                  placeholder="6-digit code"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 font-mono text-[16px] tracking-[0.25em] text-center px-3 py-2.5 border border-[color:var(--border)] rounded-[8px] bg-[color:var(--panel)] text-[color:var(--text)] focus:outline-none focus:border-[color:var(--brass)]"
                />
                <button
                  disabled={manualCode.length !== 6}
                  onClick={() => submitScan(manualCode)}
                  className="font-sans text-[13.5px] font-semibold px-5 rounded-[8px] bg-[color:var(--brass)] text-white border border-[color:var(--brass)] cursor-pointer hover:bg-[color:var(--brass-dark)] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(20,23,28,0.08)] transition-colors"
                >
                  Verify
                </button>
              </div>
            </div>
          )}

          {verifyMsg && (
            <div
              className={
                "mt-4 text-[13px] font-medium px-3.5 py-2.5 rounded-md flex items-center gap-2 " +
                (verifyMsg.includes("successfully")
                  ? "bg-[color:var(--green-bg)] text-[color:var(--green)]"
                  : "bg-[color:var(--red-bg)] text-[color:var(--red)]")
              }
            >
              {verifyMsg}
            </div>
          )}
          </div>
        </div>

        {/* Footer — brass rule to echo the top accent bar, so the card
            reads as a bounded, complete document (letterhead top and
            bottom) rather than trailing off. No "· Call Center" suffix —
            this page is visitor/guide-facing, not an internal CRM screen. */}
        <div className="border-t border-[color:var(--border)] bg-[color:var(--paper)]">
          <div className="h-[2px] bg-gradient-to-r from-transparent via-[color:var(--brass)] to-transparent opacity-40" />
          <div className="px-6 py-4 flex items-center justify-center gap-2">
            <img src={logo} alt="" aria-hidden="true" className="h-4 w-auto opacity-60" />
            <span className="text-[11px] font-medium text-[color:var(--text-3)] tracking-[0.02em]">Auction Ethiopia</span>
          </div>
        </div>
      </div>
    </div>
  );
}
