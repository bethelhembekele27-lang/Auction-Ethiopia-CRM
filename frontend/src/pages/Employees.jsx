import { useState, useEffect } from "react";
import { roleLabels, rolePrivilegeDefaults, PERMISSIONS } from "../constants/roles";
import { fmtDate } from "../utils/format";
import { Stamp, Field, Modal, inputCls } from "../components/ui";
import { HeaderCheckbox, RowCheckbox, BulkActionBar } from "../components/BulkSelect";
import { useRowSelection } from "../hooks/useRowSelection";
import { employees as employeesApi } from "../api";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";
import { EditIcon, DeleteIcon, PlusIcon, CheckIcon } from "../components/icons";

const emptyEmployee = { name: "", username: "", password: "", role: "call_operator", email: "" };

export default function Employees({ employees, setEmployees, roles, setRoles, addAudit }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(emptyEmployee);
  const [privModalOpen, setPrivModalOpen] = useState(false);
  const [privTarget, setPrivTarget] = useState(null);
  const [privDraft, setPrivDraft] = useState([]);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePrivileges, setNewRolePrivileges] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [rolesFull, setRolesFull] = useState([]);
  const [resetPwTarget, setResetPwTarget] = useState(null);
  const [resetPwValue, setResetPwValue] = useState("");
  const [resetPwConfirm, setResetPwConfirm] = useState("");
  const [resetPwError, setResetPwError] = useState("");
  const [resetPwSaving, setResetPwSaving] = useState(false);
  const sel = useRowSelection((e) => e.id);

  const { pending, confirm, cancel, run } = useConfirm();

  useEffect(() => {
    employeesApi.listRolesFull().then(setRolesFull).catch(() => {});
  }, [roles]);

  async function bulkDelete() {
    const rows = sel.selectedFrom(employees);
    if (!rows.length) return;
    confirm(`Permanently delete ${rows.length} employee(s)? This cannot be undone.`, async () => {
      setBulkError("");
      try {
        await Promise.all(rows.map((e) => employeesApi.deleteEmployee(e.id)));
        setEmployees((prev) => prev.filter((e) => !rows.some((r) => r.id === e.id)));
        rows.forEach((e) => addAudit("Delete employee", e.username, "—", "Permanently removed"));
        sel.clear();
      } catch (err) {
        setBulkError(err.body?.message || "Couldn't delete one or more employees — try again.");
      }
    });
  }

  function openNew() { setDraft({ ...emptyEmployee, role: roles[0] || "call_operator" }); setSaveError(""); setModalOpen(true); }
  async function saveNew() {
    if (!draft.name.trim() || !draft.username.trim() || !draft.password.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const created = await employeesApi.createEmployee({
        name: draft.name.trim(), username: draft.username.trim().toLowerCase(),
        password: draft.password.trim(), role: draft.role,
        email: draft.email.trim().toLowerCase(),
      });
      setEmployees((prev) => [...prev, created]);
      addAudit("Add employee", "—", `${created.username} created`, `${created.name} · ${roleLabels[created.role] || created.role} — credentials sent by text`);
      setModalOpen(false);
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't create employee — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function bulkSetStatus(nextStatus) {
    const rows = sel.selectedFrom(employees).filter((e) => e.status !== nextStatus);
    if (!rows.length) return;
    setBulkError("");
    try {
      const updates = await Promise.all(rows.map((e) => employeesApi.updateEmployee(e.id, { status: nextStatus })));
      setEmployees((prev) => prev.map((x) => {
        const idx = rows.findIndex((r) => r.id === x.id);
        return idx === -1 ? x : { ...x, ...updates[idx] };
      }));
      rows.forEach((e) => addAudit(nextStatus === "Active" ? "Activate employee" : "Deactivate employee", e.status, nextStatus, e.username));
      sel.clear();
    } catch (err) {
      setBulkError(err.body?.message || "Couldn't update one or more employees — try again.");
    }
  }

  function openPriv(emp) { setPrivTarget(emp); setPrivDraft(emp.privileges); setSaveError(""); setPrivModalOpen(true); }
  function openPrivSelected() {
    const rows = sel.selectedFrom(employees);
    if (rows.length === 1) openPriv(rows[0]);
  }
  function openResetPassword(emp) {
    setResetPwTarget(emp);
    setResetPwValue("");
    setResetPwConfirm("");
    setResetPwError("");
  }
  function openResetPasswordSelected() {
    const rows = sel.selectedFrom(employees);
    if (rows.length === 1) openResetPassword(rows[0]);
  }
  async function saveResetPassword() {
    if (!resetPwValue || resetPwValue.length < 6) { setResetPwError("Password must be at least 6 characters."); return; }
    if (resetPwValue !== resetPwConfirm) { setResetPwError("Passwords don't match."); return; }
    setResetPwSaving(true);
    setResetPwError("");
    try {
      await employeesApi.resetEmployeePassword(resetPwTarget.id, resetPwValue);
      addAudit("Reset employee password", "—", "—", resetPwTarget.username);
      setResetPwTarget(null);
      sel.clear();
    } catch (err) {
      setResetPwError(err.body?.message || "Couldn't reset password — try again.");
    } finally {
      setResetPwSaving(false);
    }
  }
  function togglePriv(p) { setPrivDraft((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])); }
  function toggleNewRolePriv(p) {
    setNewRolePrivileges((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  async function saveNewRole() {
    const name = newRoleName.trim();
    if (!name) return;
    setSaving(true);
    setSaveError("");
    try {
      const created = await employeesApi.createRole(name, newRolePrivileges);
      const key = created.key;
      setRoles((prev) => [...prev, key]);
      roleLabels[key] = created.name;
      rolePrivilegeDefaults[key] = newRolePrivileges;
      addAudit("Add role", "—", name, `New role created with ${newRolePrivileges.length}/${PERMISSIONS.length} default privileges`);
      setNewRoleName("");
      setNewRolePrivileges([]);
      setRoleModalOpen(false);
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't create role — try again.");
    } finally {
      setSaving(false);
    }
  }
  async function savePriv() {
    setSaving(true);  
    setSaveError("");
    try {
      const updated = await employeesApi.updateEmployeePrivileges(privTarget.id, privDraft);
      setEmployees((prev) => prev.map((e) => (e.id === privTarget.id ? { ...e, ...updated } : e)));
      addAudit("Edit privileges", `${privTarget.privileges.length}/${PERMISSIONS.length}`, `${privDraft.length}/${PERMISSIONS.length}`, privTarget.username);
      setPrivModalOpen(false);
      sel.clear();
    } catch (err) {
      setSaveError(err.body?.message || "Couldn't save privileges — try again.");
    } finally {
      setSaving(false);
    }
  }
  async function handleDeleteRole(role) {
    if (!window.confirm(`Delete the "${role.name}" role? This cannot be undone.`)) return;
    try {
      await employeesApi.deleteRole(role.key);
      setRolesFull((prev) => prev.filter((r) => r.key !== role.key));
      setRoles((prev) => prev.filter((k) => k !== role.key));
      addAudit("Delete role", role.name, "—", "Permanently removed");
    } catch (err) {
      window.alert(err.body?.message || "Couldn't delete role — try again.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
            Manage accounts, roles, and privileges
          </div>
        </div>
        <div className="flex gap-2">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] btn-icon-label" onClick={() => { setSaveError(""); setRoleModalOpen(true); }}>
            <PlusIcon /><span>New role</span>
          </button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)] btn-icon-label" onClick={openNew}>
            <PlusIcon /><span>New employee</span>
          </button>
        </div>
      </div>

      <BulkActionBar count={sel.selectedCount} onClear={sel.clear}>
        <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={sel.selectedCount !== 1} onClick={openPrivSelected}>
          <EditIcon /><span>Edit privileges</span>
        </button>
        <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={sel.selectedCount !== 1} onClick={openResetPasswordSelected} title="Set a new password for this employee — no old password needed">
          Reset password
        </button>
        <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] border border-[color:var(--green)] bg-[color:var(--green-bg)] text-[color:var(--green)] cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Active")}>
          <CheckIcon /><span>Activate</span>
        </button>
        <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] btn-danger-outline cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled={!sel.selectedCount} onClick={() => bulkSetStatus("Inactive")}>
          Deactivate
        </button>
        <button className="font-sans text-[13px] font-medium px-2.5 py-[5px] rounded-[5px] btn-danger-outline cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed btn-icon-label" disabled={!sel.selectedCount} onClick={bulkDelete}>
          <DeleteIcon /><span>Delete</span>
        </button>
      </BulkActionBar>

      {bulkError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{bulkError}</div>}

      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
        <div style={{ overflowX: "auto" }}>
          <table className="w-full border-collapse text-[13px] min-w-[640px]">
            <thead><tr className="group">
              <HeaderCheckbox checked={sel.isAllSelected(employees)} onChange={() => sel.toggleAll(employees)} />
              <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Name</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Username</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Role</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Last password change</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Last username change</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Privileges</th>
            </tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="group">
                  <RowCheckbox checked={sel.isSelected(e)} onChange={() => sel.toggle(e)} label={`Select ${e.username}`} />
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", background: "var(--brass)", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 600, flexShrink: 0,
                      }}>
                        {e.name.charAt(0).toUpperCase()}
                      </div>
                      {e.name}
                    </div>
                  </td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.username}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{roleLabels[e.role] || e.role}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={e.status} kind={e.status === "Active" ? "green" : "gray"} /></td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{fmtDate(e.lastPasswordChange)}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.lastUsernameChange ? fmtDate(e.lastUsernameChange) : "—"}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.privileges.length}/{PERMISSIONS.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden" style={{ marginTop: 20 }}>
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0 }}>Roles</h3>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
            Built-in roles can't be removed. Custom roles can be deleted once no employee is assigned to them.
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full border-collapse text-[13px] min-w-[640px]">
            <thead>
              <tr className="group">
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Role</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Default privileges</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Type</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]"></th>
              </tr>
            </thead>
            <tbody>
              {rolesFull.map((r) => (
                <tr key={r.key} className="group">
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle">
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                  </td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
                      <div style={{ flex: 1, height: 6, background: "var(--gray-bg)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${(r.defaultPrivileges.length / PERMISSIONS.length) * 100}%`,
                          background: "var(--brass)",
                          borderRadius: 3,
                        }} />
                      </div>
                      <span className="font-mono" style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                        {r.defaultPrivileges.length}/{PERMISSIONS.length}
                      </span>
                    </div>
                  </td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle">
                    {r.isBuiltIn
                      ? <Stamp text="Built-in" kind="gray" />
                      : <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>Custom</span>}
                  </td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle">
                    {!r.isBuiltIn && (
                      <button
                        className="btn-danger-outline font-sans text-[12px] font-medium px-2.5 py-[5px] rounded-[5px] cursor-pointer"
                        onClick={() => handleDeleteRole(r)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New employee">
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
          <Field label="Full name"><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Username"><input className={inputCls} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></Field>
          <Field label="Email (optional — needed for Google sign-in)">
            <input type="email" className={inputCls} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="name@example.com" />
          </Field>
          <Field label="Temporary password"><input className={inputCls} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></Field>
          <Field label="Role">
            <select className={inputCls} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              {roles.map((r) => <option key={r} value={r}>{roleLabels[r] || r}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>Credentials are sent to the employee by text, same as other accounts.</div>
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginTop: 10 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={saveNew}>{saving ? "Creating…" : "Create employee"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setModalOpen(false)}>Cancel</button>
        </div>
      </Modal>

      <Modal open={privModalOpen} onClose={() => setPrivModalOpen(false)} title={privTarget ? `Privileges — ${privTarget.username}` : "Privileges"}>
        {privTarget && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {PERMISSIONS.map((p) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                  <input type="checkbox" checked={privDraft.includes(p)} onChange={() => togglePriv(p)} /> {p}
                </label>
              ))}
            </div>
            {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{saveError}</div>}
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={savePriv}>{saving ? "Saving…" : "Save privileges"}</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setPrivModalOpen(false)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!resetPwTarget} onClose={() => setResetPwTarget(null)} title={resetPwTarget ? `Reset password — ${resetPwTarget.username}` : "Reset password"}>
        {resetPwTarget && (
          <>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 14 }}>
              This sets a brand-new password directly — the employee's old password won't be needed. Share the new password with them securely.
            </div>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 mb-2.5">
              <Field label="New password" full>
                <input type="password" className={inputCls} value={resetPwValue} onChange={(e) => setResetPwValue(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password" full>
                <input type="password" className={inputCls} value={resetPwConfirm} onChange={(e) => setResetPwConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </Field>
            </div>
            {resetPwError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{resetPwError}</div>}
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={resetPwSaving} onClick={saveResetPassword}>{resetPwSaving ? "Saving…" : "Reset password"}</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setResetPwTarget(null)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={roleModalOpen} onClose={() => setRoleModalOpen(false)} title="New role">
        <Field label="Role name" full><input className={inputCls} placeholder="e.g. Logistics Coordinator" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} /></Field>
        <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[color:var(--text-2)]" style={{ margin: "18px 0 8px" }}>
          Default privileges for this role
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {PERMISSIONS.map((p) => (
            <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" checked={newRolePrivileges.includes(p)} onChange={() => toggleNewRolePriv(p)} /> {p}
            </label>
          ))}
        </div>
        {saveError && <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 12 }}>{saveError}</div>}
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" disabled={saving} onClick={saveNewRole}>{saving ? "Creating…" : "Create role"}</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setRoleModalOpen(false)}>Cancel</button>
        </div>
      </Modal>
      <ConfirmDialog pending={pending} onCancel={cancel} onConfirm={run} />
    </div>
  );
}
