// Demo accounts / roles.
// Mirrors the Processing Fee Management prototype's role set so the
// same staff can move between modules with one identity.
// Each call-operator account is named after (and mapped 1:1 to) an
// entry in OPERATORS (see lookups.js), so a logged-in operator's
// reminders and escalations can be matched to them specifically.
export const demoAccounts = [
  { username: "admin", password: "admin123", role: "administrator" },
  { username: "selamawit", password: "call123", role: "call_operator" },
  { username: "dawit", password: "call123", role: "call_operator" },
  { username: "hana", password: "call123", role: "call_operator" },
  { username: "yonas", password: "call123", role: "call_operator" },
  { username: "meron", password: "call123", role: "call_operator" },
  { username: "manager", password: "manager123", role: "auction_manager" },
  { username: "viewer", password: "viewer123", role: "viewer" },
];

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

export const navItems = [
  { key: "dashboard", label: "Dashboard" },
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
  // Reached only via the notification bell — intentionally left out of
  // the main nav so it doesn't compete with the primary work areas.
  { key: "notifications", label: "Notifications", hidden: true },
];

/* ================================================================
   EMPLOYEES  (administrator only — accounts, roles, privileges)
================================================================= */
export const PERMISSIONS = [
  "View dashboard", "View inquiries", "Create / edit inquiries", "Manage follow-ups",
  "Manage visitations", "Manage complaints", "View reports", "Export reports",
  "View audit trail", "Manage employees & roles",
];

// Default privilege sets per built-in role. Pulled in here (rather than
// left inline in Employees.jsx) because seedData.js needs it to build
// seedEmployees' initial `privileges` arrays.
export const rolePrivilegeDefaults = {
  administrator: PERMISSIONS.slice(),
  call_operator: ["View dashboard", "View inquiries", "Create / edit inquiries", "Manage follow-ups", "Manage visitations", "Manage complaints"],
  auction_manager: PERMISSIONS.filter((p) => p !== "Manage employees & roles" && p !== "View reports" && p !== "Export reports"),
  viewer: ["View dashboard", "View inquiries", "View audit trail"],
};