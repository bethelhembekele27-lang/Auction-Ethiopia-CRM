// Role labels and nav/permission config — NOT user data. Actual accounts
// now live on the backend and are authenticated via api/auth.js.
export const roleLabels = {
  administrator: "Administrator",
  call_operator: "CRM / Call Center Officer",
  auction_manager: "Auction Manager",
  viewer: "Viewer",
};

// Every role can see the CRM (finance/auction/admin need context on
// customer issues too); only the roles below may create or edit records.
export const EDIT_ROLES = ["administrator", "call_operator", "auction_manager"];

// Roles that get administrator-level visibility (Reports, Audit trail,
// Escalations). Auction Manager gets everything Administrator gets
// EXCEPT the Employees page, which stays administrator-only.
export const ADMIN_LIKE_ROLES = ["administrator", "auction_manager"];

// 2.10 fix: Dashboard is analytics/rollup, not a call_operator task — their
// whole job is recording CRM data (inquiries/follow-ups/visits/complaints),
// so the tab is hidden for them rather than shown-then-blocked. Every other
// nav item below already had correct `roles` gating; Dashboard was the one
// gap (it previously had none, so every role — including call_operator —
// saw it, even though nothing there ever 403'd, it just wasn't useful to
// them and adds noise). If this assumption is wrong and operators SHOULD
// keep Dashboard, just delete the `roles` line below.
export const navItems = [
  { key: "dashboard", label: "Dashboard", roles: ["administrator", "auction_manager", "viewer"] },
  { key: "inquiries", label: "Inquiries" },
  { key: "callers", label: "Callers" },
  { key: "followups", label: "Follow-ups" },
  { key: "visitsetup", label: "Visit Setup" },
  { key: "visitations", label: "Visitations" },
  { key: "complaints", label: "Complaints" },
  { key: "reports", label: "Reports", roles: ["administrator"] },
  { key: "audit", label: "Audit trail", roles: ADMIN_LIKE_ROLES },
  { key: "escalations", label: "Manager Requests", roles: ["auction_manager", "call_operator"] },
  { key: "employees", label: "Employees", roles: ["administrator"] },
  { key: "notifications", label: "Notifications", hidden: true },
];

// Single source of truth for "what page should this role land on after
// login" — used by App.jsx instead of hardcoding "dashboard" for everyone,
// since call_operator can no longer see that tab (see navItems above).
export function defaultPageForRole(role) {
  const item = navItems.find((n) => n.key === "dashboard");
  const canSeeDashboard = !item.roles || item.roles.includes(role);
  return canSeeDashboard ? "dashboard" : "inquiries";
}

/* ================================================================
   EMPLOYEES  (administrator only — accounts, roles, privileges)
================================================================= */
export const PERMISSIONS = [
  "View dashboard", "View inquiries", "Create / edit inquiries", "Manage follow-ups",
  "Manage visitations", "Manage complaints", "View reports", "Export reports",
  "View audit trail", "Manage employees & roles",
];

// Default privilege sets per built-in role — used to pre-check boxes when
// creating a new employee. The backend is the source of truth for what
// each employee's actual privileges are once created.
export const rolePrivilegeDefaults = {
  administrator: PERMISSIONS.slice(),
  call_operator: ["View dashboard", "View inquiries", "Create / edit inquiries", "Manage follow-ups", "Manage visitations", "Manage complaints"],
  auction_manager: PERMISSIONS.filter((p) => p !== "Manage employees & roles" && p !== "View reports" && p !== "Export reports"),
  viewer: ["View dashboard", "View inquiries", "View audit trail"],
};