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

// Default privilege sets per built-in role — used to pre-check boxes when
// creating a new employee. The backend is the source of truth for what
// each employee's actual privileges are once created.
export const rolePrivilegeDefaults = {
  administrator: PERMISSIONS.slice(),
  call_operator: ["View dashboard", "View inquiries", "Create / edit inquiries", "Manage follow-ups", "Manage visitations", "Manage complaints"],
  auction_manager: PERMISSIONS.filter((p) => p !== "Manage employees & roles" && p !== "View reports" && p !== "Export reports"),
  viewer: ["View dashboard", "View inquiries", "View audit trail"],
};