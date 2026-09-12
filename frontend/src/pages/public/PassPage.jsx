import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { getPass, verifyPass } from "../../api/verification";

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
      QRCode.toDataURL(data.ownToken, { width: 220 }).then(setQrDataUrl).catch(() => {});
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

  if (error) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto", padding: 20, fontFamily: "sans-serif", textAlign: "center" }}>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;
  }

  const s = data.subject;
  const otherPartyLabel = data.role === "visitor" ? "guide's" : "visitor's";

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "24px 20px", fontFamily: "sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        {data.role === "visitor" ? "Your visit pass" : "Guide verification"}
      </h2>
      <p style={{ color: "#666", marginTop: 0 }}>Auction Ethiopia — {s.company || "Auction Ethiopia (general)"}</p>

      <div style={{ background: "#f4f3ec", borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <p><b>{s.visitorName}</b> · {s.phone}</p>
        <p>{s.auction || s.batch || "—"} — {s.visitDate} at {s.visitTime}</p>
        <p>
          {s.address || "Location to be confirmed"}
          {s.mapsLink ? <> — <a href={s.mapsLink} target="_blank" rel="noreferrer">Open in Maps</a></> : null}
        </p>
        <p>Guide: {s.guideName || "—"} ({s.guidePhone || "—"})</p>
      </div>

      <h3 style={{ marginBottom: 6 }}>Your code</h3>
      {qrDataUrl && <img src={qrDataUrl} alt="QR code" width={180} height={180} />}
      <div style={{ fontSize: 26, letterSpacing: 6, fontFamily: "monospace", marginTop: 8 }}>{data.ownCode}</div>
      <p style={{ fontSize: 12.5, color: "#888" }}>Show this to the {otherPartyLabel.replace("'s", "")} to verify you.</p>

      <hr style={{ margin: "20px 0" }} />

      {data.otherVerified ? (
        <p style={{ color: "#2F6F4E", fontWeight: 600 }}>✓ Verified</p>
      ) : (
        <>
          <h3 style={{ marginBottom: 6 }}>Scan the {otherPartyLabel} code</h3>
          {!scanning ? (
            <button onClick={startScan} style={{ padding: "10px 16px", cursor: "pointer" }}>Open camera</button>
          ) : (
            <button onClick={stopScan} style={{ padding: "10px 16px", cursor: "pointer" }}>Cancel</button>
          )}
          <div id="qr-reader" style={{ width: 260, marginTop: 10 }} />
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input
              maxLength={6}
              placeholder="6-digit code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
              style={{ padding: 8, fontSize: 16, letterSpacing: 2, width: 140 }}
            />
            <button
              disabled={manualCode.length !== 6}
              onClick={() => submitScan(manualCode)}
              style={{ padding: "8px 16px", cursor: manualCode.length === 6 ? "pointer" : "not-allowed" }}
            >
              Verify
            </button>
          </div>
        </>
      )}
      {verifyMsg && <p style={{ marginTop: 12 }}>{verifyMsg}</p>}
    </div>
  );
}
