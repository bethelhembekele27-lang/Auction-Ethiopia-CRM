import React, { useState, useRef } from "react";

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
import { roleLabels, EDIT_ROLES, ADMIN_LIKE_ROLES, navItems } from "../constants/roles";
import {
  seedInquiries, seedFollowups, seedAppointments, seedVisitSetups,
  seedComplaints, seedEscalations, seedAuditLog, seedEmployees,
} from "../constants/seedData";
import { pad, nowStamp } from "../utils/format";

// This file is intentionally thin — routing + session shell only. All
// page logic lives in pages/, all shared UI in components/. Once the
// backend exists, the seed* useState calls below get replaced with
// api calls (see api/) instead of local in-memory arrays.
function App() {
  const [page, setPage] = useState("dashboard");
  const [session, setSession] = useState(null);
  const [theme, setTheme] = useState("light");
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  const [inquiries, setInquiries] = useState(seedInquiries);
  const [followups, setFollowups] = useState(seedFollowups);
  const [appointments, setAppointments] = useState(seedAppointments);
  const [visitSetups, setVisitSetups] = useState(seedVisitSetups);
  const [complaints, setComplaints] = useState(seedComplaints);
  const [escalations, setEscalations] = useState(seedEscalations);
  const [auditLog, setAuditLog] = useState(seedAuditLog);
  const [employees, setEmployees] = useState(seedEmployees);
  const [roles, setRoles] = useState(Object.keys(roleLabels));

  const counters = useRef({
    inq: seedInquiries.length, fu: seedFollowups.length, apt: seedAppointments.length,
    vst: seedVisitSetups.length, cmp: seedComplaints.length, emp: seedEmployees.length,
    esc: seedEscalations.length,
  });
  function genId(prefix, key) {
    counters.current[key] += 1;
    return ${prefix}-${pad(counters.current[key])};
  }

  const canEdit = session ? EDIT_ROLES.includes(session.role) : false;

  function addAudit(action, prevValue, newValue, reason) {
    const { d, t } = nowStamp();
    setAuditLog((prev) => [
      { d, t, u: session?.username || "System", r: session ? roleLabels[session.role] : "—", a: action, pv: prevValue, nv: newValue, rs: reason, ip: "10.0.0.—" },
      ...prev,
    ]);
  }

  function handleLogin(role, username, remember) {
    // Resolve which named operator this login belongs to (if any), so
    // reminders/escalations can be filtered to exactly this person.
    const emp = employees.find((e) => e.username === username);
    setSession({ role, username, operatorName: emp && role === "call_operator" ? emp.name : null });
  }
  function handleLogout() {
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

  return (
    <>
      {!session ? (
        <Login onLogin={handleLogin} />
        ) : (
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
              {page === "dashboard" && <Dashboard inquiries={inquiries} followups={followups} appointments={appointments} complaints={complaints} />}
              {page === "inquiries" && (
                <Inquiries
                  inquiries={inquiries} setInquiries={setInquiries} setFollowups={setFollowups}
                  setAppointments={setAppointments} setComplaints={setComplaints} setEscalations={setEscalations}
                  visitSetups={visitSetups} genId={genId} canEdit={canEdit} addAudit={addAudit} session={session}
                />
              )}
              {page === "callers" && <Callers inquiries={inquiries} followups={followups} appointments={appointments} />}
              {page === "followups" && <Followups followups={followups} setFollowups={setFollowups} canEdit={canEdit} addAudit={addAudit} />}
              {page === "visitsetup" && <VisitSetups visitSetups={visitSetups} setVisitSetups={setVisitSetups} genId={genId} canEdit={canEdit} addAudit={addAudit} session={session} />}
              {page === "visitations" && <Visitations appointments={appointments} setAppointments={setAppointments} visitSetups={visitSetups} setFollowups={setFollowups} genId={genId} canEdit={canEdit} addAudit={addAudit} session={session} />}
              {page === "complaints" && <Complaints complaints={complaints} setComplaints={setComplaints} genId={genId} canEdit={canEdit} addAudit={addAudit} />}
              {page === "reports" && session.role === "administrator" && <Reports inquiries={inquiries} appointments={appointments} complaints={complaints} />}
              {page === "audit" && ADMIN_LIKE_ROLES.includes(session.role) && <Audit auditLog={auditLog} />}
              {page === "escalations" && (session.role === "auction_manager" || session.role === "call_operator") && (
                <Escalations escalations={escalations} setEscalations={setEscalations} addAudit={addAudit} session={session} />
              )}
              {page === "employees" && session.role === "administrator" && (
                <Employees employees={employees} setEmployees={setEmployees} roles={roles} setRoles={setRoles} genId={genId} addAudit={addAudit} />
              )}
              {page === "notifications" && <NotificationsPage items={bellItems} onClear={clearFromBell} goTo={setPage} />}
            </div>
          </div>
          {showAccountSettings && (
            <AccountSettingsModal username={session.username} onSave={handleSaveProfile} onClose={() => setShowAccountSettings(false)} />
          )}
          <NotificationPopups popupItems={popupItems} popAway={popAway} goTo={setPage} />
        </div>
      )}
    </>
  );
}

export default App;
