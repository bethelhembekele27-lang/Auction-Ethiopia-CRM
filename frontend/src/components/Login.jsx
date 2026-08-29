import { useState, useEffect, useRef } from "react";
import { auth } from "../api";
import { logo } from "../constants/assets";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef(null);

  // Google Identity Services button — the script tag lives in index.html
  // (loaded once, globally). We only initialize + render the button here,
  // once the SDK has actually loaded (hence the poll below rather than
  // assuming window.google exists on first render).
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return; // Google login not configured — button just won't render

    let cancelled = false;

    function tryInit() {
      if (cancelled) return;
      if (!window.google || !window.google.accounts || !googleButtonRef.current) {
        setTimeout(tryInit, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 316,
        text: "signin_with",
      });
    }
    tryInit();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleCredential(response) {
    setGoogleLoading(true);
    setError("");
    try {
      const { token, user } = await auth.loginWithGoogle(response.credential);
      // Google-authenticated sessions default to sessionStorage, same as
      // an unchecked "Remember me" — no separate opt-in UI for this path.
      sessionStorage.setItem("auth_token", token);
      onLogin(user.role, user.username, user.operatorName || null);
    } catch (err) {
      setError(err.body?.message || "Google sign-in failed — this account may not be linked to an employee record.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function attemptLogin() {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      // Expected shape: { token, user: { username, role, operatorName } }
      const { token, user } = await auth.login(username.trim().toLowerCase(), password);
      if (remember) localStorage.setItem("auth_token", token);
      else sessionStorage.setItem("auth_token", token);
      onLogin(user.role, user.username, user.operatorName || null);
    } catch (err) {
      setError(err.body?.message || "Incorrect username or password.");
    } finally {
      setLoading(false);
    }
  }
  function handleKeyDown(e) { if (e.key === "Enter") attemptLogin(); }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[color:var(--paper)] p-6">
      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[14px] py-9 px-8 w-full max-w-[380px]">
        <img src={logo} alt="Auction Ethiopia S.C." style={{ maxWidth: 240, width: "100%", height: "auto", objectFit: "contain", display: "block", margin: "0 auto 20px" }} />
        <h2 style={{ margin: "0 0 4px", textAlign: "center" }}>Sign in</h2>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", textAlign: "center", marginBottom: 22 }}>CRM &amp; Call Center</div>

        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, opacity: googleLoading ? 0.6 : 1, pointerEvents: googleLoading ? "none" : "auto" }}>
              <div ref={googleButtonRef} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 18px", color: "var(--text-3)", fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              or sign in with username
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
          </>
        )}

        <label className="block text-xs text-[color:var(--text-2)] uppercase tracking-[0.04em] mb-1.5">Username</label>
        <input className="w-full font-sans text-sm px-3 py-2.5 border border-[color:var(--border)] rounded-md bg-[color:var(--panel)] text-[color:var(--text)]" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={handleKeyDown} placeholder="e.g. selamawit" autoFocus />
        <label className="block text-xs text-[color:var(--text-2)] uppercase tracking-[0.04em] mb-1.5" style={{ marginTop: 12 }}>Password</label>
        <div style={{ position: "relative" }}>
          <input
            className="w-full font-sans text-sm px-3 py-2.5 border border-[color:var(--border)] rounded-md bg-[color:var(--panel)] text-[color:var(--text)]"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
            style={{ paddingRight: 36 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: 6,
              display: "flex", alignItems: "center", color: "var(--text-3)",
            }}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 .82-2.31 2.24-4.28 4.06-5.74M9.9 4.24A10.6 10.6 0 0 1 12 4c5 0 9.27 3.11 11 8-.62 1.75-1.62 3.31-2.88 4.6" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-[color:var(--text-2)] mt-3.5 cursor-pointer">
          <input className="w-auto" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me on this device
        </label>

        {error && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md mt-3.5">{error}</div>}

        <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--ink)] text-white border-[color:var(--ink)]" style={{ width: "100%", marginTop: 18 }} disabled={loading} onClick={attemptLogin}>{loading ? "Signing in…" : "Sign in"}</button>
      </div>
    </div>
  );
}
