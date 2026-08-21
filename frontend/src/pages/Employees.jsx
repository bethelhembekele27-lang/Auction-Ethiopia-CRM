import { useState } from "react";
import { demoAccounts, roleLabels, rolePrivilegeDefaults, PERMISSIONS } from "../constants/roles";
import { OPERATORS } from "../constants/lookups";
import { todayISO, fmtDate } from "../utils/format";
import { Stamp, Field, Modal, inputCls } from "../components/ui";

/* ================================================================
   EMPLOYEES  (administrator only — accounts, roles, privileges)
================================================================= */
const emptyEmployee = { name: "", username: "", password: "", role: "call_operator" };

export function Employees({ employees, setEmployees, roles, setRoles, genId, addAudit }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(emptyEmployee);
  const [privModalOpen, setPrivModalOpen] = useState(false);
  const [privTarget, setPrivTarget] = useState(null);
  const [privDraft, setPrivDraft] = useState([]);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  function openNew() { setDraft({ ...emptyEmployee, role: roles[0] || "call_operator" }); setModalOpen(true); }
  function saveNew() {
    if (!draft.name.trim() || !draft.username.trim() || !draft.password.trim()) return;
    const record = {
      id: genId("EMP", "emp"), name: draft.name.trim(), username: draft.username.trim().toLowerCase(),
      role: draft.role, status: "Active", lastPasswordChange: todayISO(), lastUsernameChange: "",
      privileges: rolePrivilegeDefaults[draft.role] || [],
    };
    setEmployees((prev) => [...prev, record]);
    demoAccounts.push({ username: record.username, password: draft.password.trim(), role: record.role });
    if (record.role === "call_operator" && !OPERATORS.includes(record.name)) OPERATORS.push(record.name);
    addAudit("Add employee", "—", `${record.username} created`, `${record.name} · ${roleLabels[record.role] || record.role} — credentials sent by text`);
    setModalOpen(false);
  }
  function toggleStatus(emp) {
    const next = emp.status === "Active" ? "Inactive" : "Active";
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, status: next } : e)));
    addAudit(next === "Active" ? "Activate employee" : "Deactivate employee", emp.status, next, `${emp.username}`);
  }
  function openPriv(emp) { setPrivTarget(emp); setPrivDraft(emp.privileges); setPrivModalOpen(true); }
  function togglePriv(p) { setPrivDraft((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])); }
  function savePriv() {
    setEmployees((prev) => prev.map((e) => (e.id === privTarget.id ? { ...e, privileges: privDraft } : e)));
    addAudit("Edit privileges", `${privTarget.privileges.length}/${PERMISSIONS.length}`, `${privDraft.length}/${PERMISSIONS.length}`, privTarget.username);
    setPrivModalOpen(false);
  }
  function saveNewRole() {
    const name = newRoleName.trim();
    if (!name) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (roles.includes(key)) return;
    setRoles((prev) => [...prev, key]);
    roleLabels[key] = name;
    rolePrivilegeDefaults[key] = [];
    addAudit("Add role", "—", name, "New role created — assign privileges from Employees");
    setNewRoleName("");
    setRoleModalOpen(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)]" onClick={() => setRoleModalOpen(true)}>New role</button>
        <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" style={{ marginLeft: "auto" }} onClick={openNew}>+ New employee</button>
      </div>
      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
        <div style={{ overflowX: "auto" }}>
          <table className="w-full border-collapse text-[13px] min-w-[640px]">
            <thead><tr className="group"><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Name</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Username</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Role</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Status</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Last password change</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Last username change</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Privileges</th><th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Actions</th></tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="group">
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{e.name}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.username}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{roleLabels[e.role] || e.role}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]"><Stamp text={e.status} kind={e.status === "Active" ? "green" : "gray"} /></td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{fmtDate(e.lastPasswordChange)}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.lastUsernameChange ? fmtDate(e.lastUsernameChange) : "—"}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{e.privileges.length}/{PERMISSIONS.length}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">
                    <div className="flex gap-1.5 flex-wrap">
                      <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs" onClick={() => openPriv(e)}>Edit privileges</button>
                      <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] px-2.5 py-[5px] text-xs bg-[color:var(--red-bg)] text-[color:var(--red)] border-[color:var(--red)]" onClick={() => toggleStatus(e)}>{e.status === "Active" ? "Deactivate" : "Activate"}</button>
                    </div>
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
          <Field label="Temporary password"><input className={inputCls} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></Field>
          <Field label="Role">
            <select className={inputCls} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              {roles.map((r) => <option key={r} value={r}>{roleLabels[r] || r}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>Credentials are sent to the employee by text, same as other accounts.</div>
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" onClick={saveNew}>Create employee</button>
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
            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" onClick={savePriv}>Save privileges</button>
              <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setPrivModalOpen(false)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={roleModalOpen} onClose={() => setRoleModalOpen(false)} title="New role">
        <Field label="Role name" full><input className={inputCls} placeholder="e.g. Logistics Coordinator" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} /></Field>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>New roles start with no privileges — assign them from the employee list after creating.</div>
        <div className="flex flex-wrap gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-[color:var(--brass)] text-white border-[color:var(--brass)]" onClick={saveNewRole}>Create role</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] bg-transparent" onClick={() => setRoleModalOpen(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}