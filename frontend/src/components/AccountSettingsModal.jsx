import { useState } from "react";
import { auth } from "../api";

export default function AccountSettingsModal({ username, onSave, onClose }) {
  const [name, setName] = useState(username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Username and password now go through two separate backend endpoints
  // (PATCH /account/username/ and PATCH /account/change-password/) rather
  // than one combined PATCH /auth/me — that route never actually existed
  // on this backend, so this modal previously 404'd on every save. Each
  // piece is attempted and reported independently: if the name change
  // succeeds but the password change fails (e.g. wrong current password),
  // the name change should still stick rather than the whole save
  // silently rolling back or double-attempting the part that worked.
  async function handleSave() {
    setError("");
    if (!name.trim()) { setError("Name can't be empty."); return; }
    if (newPassword && newPassword !== confirmPassword) { setError("New passwords don't match."); return; }
    if (newPassword && !currentPassword) { setError("Enter your current password to set a new one."); return; }

    setSaving(true);
    const errors = [];

    const usernameChanged = name.trim() !== username;
    if (usernameChanged) {
      try {
        await auth.updateUsername(name.trim());
        onSave(name.trim());
      } catch (err) {
        errors.push(err.body?.message || "Couldn't update display name.");
      }
    }

    if (newPassword) {
      try {
        await auth.changePassword(currentPassword, newPassword);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        errors.push(err.body?.message || "Couldn't update password.");
      }
    }

    setSaving(false);
    if (errors.length) {
      setError(errors.join(" "));
    } else {
      setSaved(true);
      setTimeout(onClose, 900);
    }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(20,23,28,0.45)] flex items-center justify-center z-50 p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl w-full max-h-[90vh] overflow-y-auto p-0 dark:bg-[color:var(--panel)] dark:text-[color:var(--text)]" style={{ maxWidth: 440 }}>
        <div className="px-6 py-5 border-b border-[color:var(--border)] flex justify-between items-start sticky top-0 bg-[color:var(--panel)]">
          <h2 style={{ margin: 0 }}>Edit profile</h2>
          <button className="cursor-pointer text-[color:var(--text-2)] text-xl leading-none bg-transparent border-none" onClick={onClose}>&times;</button>
        </div>
        <div className="px-6 py-5">
          <label className="block text-xs text-[color:var(--text-2)] uppercase tracking-[0.04em] mb-1.5">Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          <label className="block text-xs text-[color:var(--text-2)] uppercase tracking-[0.04em] mb-1.5">Current password <span style={{ color: "var(--text-3)", textTransform: "none" }}>(only needed to set a new one)</span></label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" style={{ marginBottom: 14 }} />
          <label className="block text-xs text-[color:var(--text-2)] uppercase tracking-[0.04em] mb-1.5">New password <span style={{ color: "var(--text-3)", textTransform: "none" }}>(leave blank to keep current)</span></label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" style={{ marginBottom: 14 }} />
          <label className="block text-xs text-[color:var(--text-2)] uppercase tracking-[0.04em] mb-1.5">Confirm new password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" style={{ marginBottom: 14 }} />
          {error && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md mt-3.5" style={{ marginBottom: 12 }}>{error}</div>}
          {saved && <div className="bg-[color:var(--green-bg)] text-[color:var(--green)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>Saved.</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save changes"}</button>
            <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
