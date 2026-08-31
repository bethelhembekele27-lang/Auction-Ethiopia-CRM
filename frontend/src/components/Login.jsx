import { useState, useEffect, useRef } from "react";
import { auth } from "../api";
import { logo } from "../constants/assets";

// Module-level guard — React 19 StrictMode intentionally double-invokes
// effects in dev (mount → cleanup → remount) to surface bugs. Our cleanup
// can't actually "un-initialize" Google's SDK (there's no such API), so
// without this guard initialize() legitimately fires twice per dev
// session — harmless (Google just warns and uses the last call), but
// noisy. This flag survives across the double-mount since it's outside
// the component, and does NOT affect the production build, where
// StrictMode's double-invoke doesn't happen.
let googleInitialized = false;

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef(null);
  const googleWrapRef = useRef(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    let cancelled = false;
    let resizeHandler = null;

    function renderGoogleButton() {
      if (cancelled || !window.google || !window.google.accounts || !googleButtonRef.current || !googleWrapRef.current) return;
      const width = Math.round(googleWrapRef.current.getBoundingClientRect().width);
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: width || 316,
        text: "signin_with",
      });
    }

    function tryInit() {
      if (cancelled) return;
      if (!window.google || !window.google.accounts) {
        setTimeout(tryInit, 100);
        return;
      }
      if (!googleInitialized) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredential,
        });
        googleInitialized = true;
      }
      renderGoogleButton();

      resizeHandler = () => renderGoogleButton();
      window.addEventListener("resize", resizeHandler);
    }
    tryInit();

    return () => {
      cancelled = true;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleCredential(response) {
    setGoogleLoading(true);
    setError("");
    try {
      const { token, user } = await auth.loginWithGoogle(response.credential);
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
  function handleKeyDown(e) { if (e.key === "Enter" && !loading) attemptLogin(); }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[color:var(--paper)] p-6">
      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-xl py-8 px-7 w-full max-w-[380px]">
        <div className="flex justify-center mb-4">
          <img
            src={logo}
            alt="Auction Ethiopia S.C."
            style={{ maxWidth: 220, width: "100%", height: "auto", objectFit: "contain" }}
          />
        </div>

        <h1 className="text-center text-xl font-semibold text-[color:var(--text)] mb-0.5">
          Sign in
        </h1>
        <p className="text-center text-[13px] text-[color:var(--brass)] font-medium mb-5">
          Call Center Management
        </p>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-[color:var(--text-2)] uppercase tracking-wider mb-1.5">
            Username
          </label>
          <input
            type="text"
            className="w-full px-3 py-2.5 text-sm border border-[color:var(--border)] rounded-md bg-[color:var(--panel)] text-[color:var(--text)] placeholder-[color:var(--text-3)] focus:outline-none focus:border-[color:var(--brass)] transition-colors"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. admin"
            autoComplete="username"
            autoFocus
            disabled={loading || googleLoading}
          />
        </div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-[color:var(--text-2)] uppercase tracking-wider mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="w-full px-3 py-2.5 pr-10 text-sm border border-[color:var(--border)] rounded-md bg-[color:var(--panel)] text-[color:var(--text)] placeholder-[color:var(--text-3)] focus:outline-none focus:border-[color:var(--brass)] transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading || googleLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-[color:var(--text-3)] hover:text-[color:var(--text-2)] transition-colors"
              disabled={loading || googleLoading}
            >
              {showPassword ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 .82-2.31 2.24-4.28 4.06-5.74M9.9 4.24A10.6 10.6 0 0 1 12 4c5 0 9.27 3.11 11 8-.62 1.75-1.62 3.31-2.88 4.6" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-[color:var(--text-2)] mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={loading || googleLoading}
            className="w-[15px] h-[15px] cursor-pointer"
          />
          Remember me on this device
        </label>

        {error && (
          <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md mb-4">
            {error}
          </div>
        )}

        <button
          onClick={attemptLogin}
          disabled={loading || googleLoading || !username.trim() || !password}
          className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[color:var(--ink)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-opacity"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[color:var(--border)]" />
              <span className="text-[11px] text-[color:var(--text-3)] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-[color:var(--border)]" />
            </div>
            <div
              ref={googleWrapRef}
              className="w-full"
              style={{
                opacity: googleLoading ? 0.6 : 1,
                pointerEvents: googleLoading ? "none" : "auto",
              }}
            >
              <div ref={googleButtonRef} style={{ width: "100%" }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}