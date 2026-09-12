import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { getPass, verifyPass } from "../../api/verification";
import { logo } from "../../constants/assets";
import watermark from "../../constants/assets/watermark.png";
import { Stamp } from "../../components/ui";

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

  useEffect(() => {
    if (data?.ownToken) {
      QRCode.toDataURL(data.ownToken, { width: 220, margin: 0 }).then(setQrDataUrl).catch(() => {});
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

  // Standalone page — outside the app shell, but index.css (Tailwind +
  // the app's --brass/--panel/etc CSS vars + Space Grotesk/Inter fonts)
  // is already loaded globally via main.jsx, so reuse the same design
  // language as the rest of the CRM rather than inventing a new one.
  const shellCls = "min-h-screen w-full bg-[color:var(--paper)] flex items-start justify-center py-10 px-4";
  const cardCls = "relative w-full max-w-[440px] bg-[color:var(--panel)] border border-[color:var(--border)] rounded-xl shadow-[0_8px_28px_rgba(20,23,28,0.10)] overflow-hidden";

  // Faint corner watermark — same visual language as the PDF export
  // template in utils/export.js (low-opacity logo mark tucked in a
  // corner, never competing with the QR code or copy for attention).
  function Watermark() {
    return (
      <img
        src={watermark}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute -right-6 -bottom-6 w-[170px] opacity-[0.05] z-0"
      />
    );
  }

  if (error) {
    return (
      <div className={shellCls}>
        <div className={cardCls + " p-8 text-center"}>
          <Watermark />
          <div className="relative z-10">
            <img src={logo} alt="Auction Ethiopia" className="h-8 w-auto mx-auto mb-5 opacity-90" />
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[color:var(--red-bg)] text-[color:var(--red)] text-xl mb-3">!</div>
            <p className="font-display text-[15px] font-semibold text-[color:var(--text)]">{error}</p>
            <p className="text-[13px] text-[color:var(--text-3)] mt-1.5">If this looks wrong, ask the call center to resend your confirmation.</p>
          </div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={shellCls}>
        <div className="text-[13px] text-[color:var(--text-2)]">Loading…</div>
      </div>
    );
  }

  const s = data.subject;
  const isVisitor = data.role === "visitor";
  const otherRoleLabel = isVisitor ? "Guide" : "Visitor";

  // Detail rows are built dynamically so blank/irrelevant fields (no
  // batch on a general inquiry-driven visit, no maps link supplied,
  // etc.) never render as an empty "—" row — a printed/screenshotted
  // pass should only show what's actually known.
  const rows = [
    s.auction && { label: "Auction", value: s.auction },
    s.batch && { label: "Batch", value: s.batch },
    s.items && { label: "Item(s)", value: s.items },
    { label: "Date & time", value: `${s.visitDate} · ${s.visitTime}` },
    {
      label: "Location",
      value: (
        <>
          {s.address || "To be confirmed"}
          {s.mapsLink && (
            <>
              {" "}
              <a
                href={s.mapsLink}
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--blue)] font-medium underline underline-offset-2 hover:text-[color:var(--blue)]"
              >
                Open in Maps
              </a>
            </>
          )}
        </>
      ),
    },
    !isVisitor
      ? null
      : { label: "Assigned guide", value: <>{s.guideName || "—"} {s.guidePhone && <span className="font-mono">({s.guidePhone})</span>}</> },
  ].filter(Boolean);

  return (
    <div className={shellCls}>
      <div className={cardCls}>
        <Watermark />

        {/* Header */}
        <div className="relative z-10 px-6 pt-6 pb-5 border-b border-[color:var(--border)] bg-[color:var(--paper)]">
          <img src={logo} alt="Auction Ethiopia" className="h-7 w-auto mb-3" />
          <h1 className="font-display text-[20px] font-semibold tracking-[-0.01em] text-[color:var(--text)] m-0">
            {isVisitor ? "Visit pass" : "Guide verification"}
          </h1>
          <p className="text-[12.5px] text-[color:var(--text-2)] mt-0.5 mb-0">
            {s.company || "Auction Ethiopia (general)"}
          </p>
        </div>

        {/* Visit details */}
        <div className="relative z-10 px-6 py-5">
          <div className="bg-[color:var(--paper)] border border-[color:var(--border)] rounded-lg p-4 mb-6">
            <div className="flex items-baseline justify-between gap-2 mb-3 pb-3 border-b border-[color:var(--border)]">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.04em] text-[color:var(--text-3)] mb-0.5">
                  {isVisitor ? "Visitor" : "Visitor to verify"}
                </div>
                <span className="font-display font-semibold text-[15.5px] text-[color:var(--text)]">{s.visitorName}</span>
              </div>
              <span className="text-[12.5px] font-mono text-[color:var(--text-2)]">{s.phone}</span>
            </div>
            <dl className="text-[13px] text-[color:var(--text-2)] space-y-2">
              {rows.map((r) => (
                <div className="flex gap-3" key={r.label}>
                  <dt className="w-[92px] shrink-0 text-[color:var(--text-3)] uppercase text-[10.5px] tracking-[0.04em] pt-0.5">{r.label}</dt>
                  <dd className="m-0 leading-[1.5]">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Own QR + code */}
          <div className="text-center mb-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[color:var(--text-2)] mb-3">Your code</div>
            {qrDataUrl && (
              <div className="inline-block p-3.5 bg-white border border-[color:var(--border)] rounded-lg shadow-[0_1px_3px_rgba(20,23,28,0.06)]">
                <img src={qrDataUrl} alt="QR code" width={180} height={180} className="block" />
              </div>
            )}
            <div className="font-mono text-[26px] font-semibold tracking-[0.3em] text-[color:var(--text)] mt-3">
              {data.ownCode}
            </div>
            <p className="text-[12px] text-[color:var(--text-3)] mt-1">
              Show this to the {otherRoleLabel.toLowerCase()} to verify you.
            </p>
          </div>

          <div className="h-px bg-[color:var(--border)] mb-6" />

          {/* Verification status / scanner */}
          {data.otherVerified ? (
            <div className="flex items-center justify-center gap-2.5 bg-[color:var(--green-bg)] rounded-lg py-3.5 px-4">
              <span className="text-[13.5px] font-medium text-[color:var(--text)]">{otherRoleLabel} confirmed</span>
              <Stamp text="Verified" kind="green" />
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[color:var(--text-2)] mb-3 text-center">
                Scan the {otherRoleLabel.toLowerCase()}'s code
              </div>

              {!scanning ? (
                <button
                  onClick={startScan}
                  className="w-full font-sans text-[13.5px] font-semibold py-2.5 rounded-[6px] bg-[color:var(--brass)] text-white border border-[color:var(--brass)] cursor-pointer hover:bg-[color:var(--brass-dark)] hover:border-[color:var(--brass-dark)] shadow-[0_1px_2px_rgba(20,23,28,0.08)] transition-colors"
                >
                  Open camera
                </button>
              ) : (
                <button
                  onClick={stopScan}
                  className="w-full font-sans text-[13.5px] font-medium py-2.5 rounded-[6px] bg-[color:var(--panel)] text-[color:var(--text)] border border-[color:var(--border)] cursor-pointer hover:border-[color:var(--text-3)] transition-colors"
                >
                  Cancel scanning
                </button>
              )}

              <div id="qr-reader" className="w-full mt-3 rounded-lg overflow-hidden [&_video]:rounded-lg" />

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
                  className="flex-1 font-mono text-[16px] tracking-[0.25em] text-center px-3 py-2.5 border border-[color:var(--border)] rounded-[6px] bg-[color:var(--panel)] text-[color:var(--text)] focus:outline-none focus:border-[color:var(--brass)]"
                />
                <button
                  disabled={manualCode.length !== 6}
                  onClick={() => submitScan(manualCode)}
                  className="font-sans text-[13.5px] font-semibold px-5 rounded-[6px] bg-[color:var(--brass)] text-white border border-[color:var(--brass)] cursor-pointer hover:bg-[color:var(--brass-dark)] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(20,23,28,0.08)] transition-colors"
                >
                  Verify
                </button>
              </div>
            </div>
          )}

          {verifyMsg && (
            <div
              className={
                "mt-4 text-[13px] font-medium px-3.5 py-2.5 rounded-md " +
                (verifyMsg.includes("successfully")
                  ? "bg-[color:var(--green-bg)] text-[color:var(--green)]"
                  : "bg-[color:var(--red-bg)] text-[color:var(--red)]")
              }
            >
              {verifyMsg}
            </div>
          )}
        </div>

        <div className="relative z-10 px-6 py-3.5 border-t border-[color:var(--border)] bg-[color:var(--paper)] text-center">
          <span className="text-[11px] font-medium text-[color:var(--text-3)]">Auction Ethiopia</span>
        </div>
      </div>
    </div>
  );
}

