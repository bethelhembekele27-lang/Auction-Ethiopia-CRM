import { useState, useRef, useEffect, useCallback } from "react";

import Login from "../components/Login";
import Header from "../components/Header";
import AccountSettingsModal from "../components/AccountSettingsModal";
import NotificationPopups from "../components/NotificationPopups";

import Dashboard from "../pages/Dashboard";
import Inquiries from "../pages/Inquiries";
import Callers from "../pages/Callers";
import Followups from "../pages/Followups";
import VisitSetups from "../pages/VisitSetups";
import Visitations from "../pages/Visitations";
import Complaints from "../pages/Complaints";
import Reports from "../pages/Reports";
import Audit from "../pages/Audit";
import Escalations from "../pages/Escalations";
import Employees from "../pages/Employees";
import NotificationsPage from "../pages/NotificationsPage";

import { useNotifications } from "../hooks/useNotifications";
import { roleLabels, EDIT_ROLES, ADMIN_LIKE_ROLES, navItems, defaultPageForRole } from "../constants/roles";
import { pad, nowStamp } from "../utils/format";
import * as api from "../api";

// This file is intentionally thin — routing + session shell only. All
// page logic lives in pages/, all shared UI in components/. Every entity
// list starts empty and is populated from the backend once a session
// exists — no hardcoded/seed data anywhere in the frontend.
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [session, setSession] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("crm_theme") || "light");
  useEffect(() => {
    localStorage.setItem("crm_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  const [inquiries, setInquiries] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [visitSetups, setVisitSetups] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState(Object.keys(roleLabels));

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Used only for optimistic client-side IDs before the backend responds
  // with the real one on create. Once every page's save() awaits the API
  // response and uses its returned id, this can be removed entirely.
  const counters = useRef({ inq: 0, fu: 0, apt: 0, vst: 0, cmp: 0, emp: 0, esc: 0 });
  function genId(prefix, key) {
    counters.current[key] += 1;
    return `${prefix}-${pad(counters.current[key])}`;
  }

  const canEdit = session ? EDIT_ROLES.includes(session.role) : false;

  // 2.10: which nav items THIS session is allowed to see — single source
  // of truth, reused for both the header nav and for guarding page
  // rendering below, so "hidden tab" and "blocked page" can never drift
  // out of sync with each other again.
  const allowedPageKeys = new Set(
    navItems.filter((n) => !n.roles || (session && n.roles.includes(session.role))).map((n) => n.key)
  );
  function canSeePage(key) {
    return allowedPageKeys.has(key);
  }

  function addAudit(action, prevValue, newValue, reason) {
    const { d, t } = nowStamp();
    setAuditLog((prev) => [
      { d, t, u: session?.username || "System", r: session ? roleLabels[session.role] : "—", a: action, pv: prevValue, nv: newValue, rs: reason, ip: "10.0.0.—" },
      ...prev,
    ]);
  }

  // Pulls every entity list from the backend in parallel. Called once a
  // session exists (after login, or on page refresh once auth persistence
  // is wired up). Each list is left empty on failure rather than crashing —
  // pages already render EmptyState / "No data yet" for empty arrays.
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const isAdminLike = session && ADMIN_LIKE_ROLES.includes(session.role);

      const results = await Promise.allSettled([
        api.inquiries.listInquiries(),
        api.followups.listFollowups(),
        api.appointments.listAppointments(),
        api.visitSetups.listVisitSetups(),
        api.complaints.listComplaints(),
        api.escalations.listEscalations(),
        isAdminLike ? api.audit.listAuditLog() : Promise.resolve([]),
        api.employees.listEmployees(),
        api.employees.listRoles(),
      ]);

      const [
        inquiriesRes, followupsRes, appointmentsRes, visitSetupsRes,
        complaintsRes, escalationsRes, auditRes, employeesRes, rolesRes,
      ] = results.map((r) => (r.status === "fulfilled" ? r.value : null));

      setInquiries(inquiriesRes || []);
      setFollowups(followupsRes || []);
      setAppointments(appointmentsRes || []);
      setVisitSetups(visitSetupsRes || []);
      setComplaints(complaintsRes || []);
      setEscalations(escalationsRes || []);
      setAuditLog(auditRes || []);
      setEmployees(employeesRes || []);
      if (rolesRes && rolesRes.length) setRoles(rolesRes);

      // Only surface a real error banner if something unexpected failed —
      // not for endpoints this role isn't supposed to access anyway.
      const unexpectedFailure = results.some((r, i) => r.status === "rejected" && !(i === 6 && !isAdminLike));
      if (unexpectedFailure) {
        setLoadError("Some data couldn't be loaded — try refreshing.");
      }
    } catch (err) {
      setLoadError(err.body?.message || "Couldn't load data from the server.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) loadAllData();
  }, [session, loadAllData]);

  function handleLogin(role, username, operatorName) {
    setSession({ role, username, operatorName: operatorName || null });
    // 2.10: land on a page this role can actually see — previously every
    // role always opened on "dashboard" even when that tab was about to
    // be hidden from them.
    setPage(defaultPageForRole(role));
  }
  async function handleLogout() {
    try { await api.auth.logout(); } catch { /* ignore network errors on logout */ }
    localStorage.removeItem("auth_token");
    sessionStorage.removeItem("auth_token");
    setSession(null);
    setPage("dashboard");
  }
  function handleSaveProfile(newUsername) {
    setSession((s) => ({ ...s, username: newUsername }));
  }

  const { popupItems, bellItems, popAway, clearFromBell } = useNotifications(
    session || { role: null, username: null, operatorName: null },
    followups,
    escalations
  );

  if (!session) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex flex-col min-h-screen max-w-[100vw] text-[color:var(--text)] bg-[color:var(--paper)]" data-theme={theme}>
      <Header
        page={page} setPage={setPage} role={session.role} username={session.username}
        theme={theme} setTheme={setTheme} onLogout={handleLogout} onOpenAccountSettings={() => setShowAccountSettings(true)}
        bellItems={bellItems} onGoToNotification={setPage}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="pt-[26px] px-7 pb-15 mobile:pt-[18px] mobile:px-4 mobile:pb-10">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
            <h1 style={{ margin: 0 }}>{navItems.find((n) => n.key === page)?.label}</h1>
            {!canEdit && (
              <span className="inline-block font-mono font-semibold text-[10.5px] tracking-[0.06em] uppercase px-[9px] py-[3px] rounded-[3px] border-[1.5px] border-current whitespace-nowrap my-0.5 dark:bg-white/[0.08] text-[color:var(--gray)] bg-[color:var(--gray-bg)]">
                View only — {roleLabels[session.role]}
              </span>
            )}
          </div>
          {loadError && (
            <div className="bg-[color:var(--red-bg)] text-[color:var(--red)] text-[12.5px] px-3 py-2 rounded-md" style={{ marginBottom: 16 }}>
              {loadError} <button className="underline cursor-pointer bg-transparent border-none text-[color:var(--red)]" onClick={loadAllData}>Retry</button>
            </div>
          )}
          {loading ? (
            <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-3)", padding: "40px 0" }}>Loading…</div>
          ) : (
            <>
              {page === "dashboard" && canSeePage("dashboard") && <Dashboard inquiries={inquiries} followups={followups} appointments={appointments} complaints={complaints} employees={employees} />}
              {page === "inquiries" && (
                <Inquiries
                  inquiries={inquiries} setInquiries={setInquiries} setFollowups={setFollowups}
                  setAppointments={setAppointments} setComplaints={setComplaints} setEscalations={setEscalations}
                  visitSetups={visitSetups} employees={employees} genId={genId} canEdit={canEdit} addAudit={addAudit} session={session}
                />
              )}
              {page === "callers" && <Callers inquiries={inquiries} followups={followups} appointments={appointments} />}
              {page === "followups" && <Followups followups={followups} setFollowups={setFollowups} canEdit={canEdit} addAudit={addAudit} />}
              {page === "visitsetup" && <VisitSetups visitSetups={visitSetups} setVisitSetups={setVisitSetups} genId={genId} canEdit={canEdit} addAudit={addAudit} session={session} />}
              {page === "visitations" && <Visitations appointments={appointments} setAppointments={setAppointments} visitSetups={visitSetups} setFollowups={setFollowups} genId={genId} canEdit={canEdit} addAudit={addAudit} session={session} />}
              {page === "complaints" && <Complaints complaints={complaints} setComplaints={setComplaints} genId={genId} canEdit={canEdit} addAudit={addAudit} session={session} />} 
              {page === "reports" && canSeePage("reports") && <Reports inquiries={inquiries} appointments={appointments} complaints={complaints} />}
              {page === "audit" && canSeePage("audit") && <Audit auditLog={auditLog} setAuditLog={setAuditLog} session={session} />}
              {page === "escalations" && canSeePage("escalations") && (
                <Escalations escalations={escalations} setEscalations={setEscalations} addAudit={addAudit} session={session} />
              )}
              {page === "employees" && canSeePage("employees") && (
                <Employees employees={employees} setEmployees={setEmployees} roles={roles} setRoles={setRoles} genId={genId} addAudit={addAudit} />
              )}
              {page === "notifications" && <NotificationsPage items={bellItems} onClear={clearFromBell} goTo={setPage} />}
            </>
          )}
        </div>
      </div>
      {showAccountSettings && (
        <AccountSettingsModal username={session.username} onSave={handleSaveProfile} onClose={() => setShowAccountSettings(false)} />
      )}
      <NotificationPopups popupItems={popupItems} popAway={popAway} goTo={setPage} />
    </div>
  );
}