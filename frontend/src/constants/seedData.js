import { OPERATORS, AUCTIONS } from "./lookups";
import { rolePrivilegeDefaults } from "./roles";

export const seedInquiries = [
  { id: "INQ-0001", callerName: "Abel Tesfaye", phone: "0911223344", company: "Tesfaye Trading PLC", auction: AUCTIONS[0], category: "Bidder Registration", priority: "Medium", operator: OPERATORS[0], dateTime: "2026-07-02T09:15", description: "Wants to know documents required to register as a bidder for the vehicle auction.", status: "Resolved", followUpDate: "", resolutionNotes: "Sent list of required documents via email.", resolvedDate: "2026-07-03", attachments: [] },
  { id: "INQ-0002", callerName: "Marta Hailu", phone: "0922334455", company: "", auction: AUCTIONS[2], category: "Processing Fee Inquiry", priority: "High", operator: OPERATORS[1], dateTime: "2026-07-05T11:40", description: "Disputes the processing fee charged for a real estate lot.", status: "Pending Follow-up", followUpDate: "2026-07-12", resolutionNotes: "", resolvedDate: "", attachments: ["fee_receipt.pdf"] },
  { id: "INQ-0003", callerName: "Kalkidan Worku", phone: "0933445566", company: "Worku Imports", auction: AUCTIONS[1], category: "Visitation Appointment", priority: "Low", operator: OPERATORS[2], dateTime: "2026-07-08T14:05", description: "Requests site visit to inspect industrial equipment lot 14.", status: "Assigned", followUpDate: "2026-07-15", resolutionNotes: "", resolvedDate: "", attachments: [] },
  { id: "INQ-0004", callerName: "Abel Tesfaye", phone: "0911223344", company: "Tesfaye Trading PLC", auction: AUCTIONS[0], category: "Payment Inquiry", priority: "Urgent", operator: OPERATORS[0], dateTime: "2026-07-10T16:20", description: "Payment for winning bid not reflecting in the system.", status: "With Manager", followUpDate: "2026-07-11", resolutionNotes: "", resolvedDate: "", attachments: [] },
  { id: "INQ-0005", callerName: "Selam Getachew", phone: "0944556677", company: "", auction: AUCTIONS[3], category: "Technical Support", priority: "Medium", operator: OPERATORS[3], dateTime: "2026-07-14T10:00", description: "Unable to upload bid documents on the portal.", status: "Closed", followUpDate: "", resolutionNotes: "Guided through browser cache clear, issue resolved.", resolvedDate: "2026-07-14", attachments: [] },
  { id: "INQ-0006", callerName: "Bereket Alemu", phone: "0955667788", company: "Alemu Construction", auction: AUCTIONS[4], category: "Complaint", priority: "High", operator: OPERATORS[4], dateTime: "2026-07-16T09:30", description: "Complaint about condition of machinery listed as 'like new'.", status: "Open", followUpDate: "2026-07-20", resolutionNotes: "", resolvedDate: "", attachments: ["photos.zip"] },
  { id: "INQ-0007", callerName: "Marta Hailu", phone: "0922334455", company: "", auction: AUCTIONS[2], category: "General Inquiry", priority: "Low", operator: OPERATORS[1], dateTime: "2026-07-18T13:10", description: "Asking about auction result publishing schedule.", status: "Resolved", followUpDate: "", resolutionNotes: "Informed results are published within 48 hours.", resolvedDate: "2026-07-18", attachments: [] },
  { id: "INQ-0008", callerName: "Nardos Fikre", phone: "0966778899", company: "Fikre Motors", auction: AUCTIONS[0], category: "Auction Information", priority: "Medium", operator: OPERATORS[2], dateTime: "2026-07-21T15:45", description: "Wants catalogue of vehicles in the upcoming auction.", status: "Waiting for Customer", followUpDate: "2026-07-25", resolutionNotes: "", resolvedDate: "", attachments: [] },
  { id: "INQ-0009", callerName: "Kalkidan Worku", phone: "0933445566", company: "Worku Imports", auction: AUCTIONS[1], category: "Bid Submission", priority: "High", operator: OPERATORS[2], dateTime: "2026-07-23T08:50", description: "Needs help submitting a sealed bid before the deadline.", status: "Assigned", followUpDate: "2026-07-24", resolutionNotes: "", resolvedDate: "", attachments: [] },
  { id: "INQ-0010", callerName: "Yared Solomon", phone: "0977889900", company: "", auction: AUCTIONS[3], category: "Registration Support", priority: "Low", operator: OPERATORS[3], dateTime: "2026-07-25T12:15", description: "Trouble completing online registration form.", status: "Open", followUpDate: "2026-07-29", resolutionNotes: "", resolvedDate: "", attachments: [] },
];

export const seedFollowups = [
  { id: "FU-0001", inquiryId: "INQ-0002", callerName: "Marta Hailu", date: "2026-07-12", reminder: true, assignedOperator: OPERATORS[1], status: "Pending", notes: "Call back with finance department's fee breakdown.", createdDate: "2026-07-05", company: "", batch: "", guideName: "" },
  { id: "FU-0002", inquiryId: "INQ-0003", callerName: "Kalkidan Worku", date: "2026-07-15", reminder: true, assignedOperator: OPERATORS[2], status: "Pending", notes: "Confirm visitation slot with logistics.", createdDate: "2026-07-08", company: "Worku Imports", batch: "Batch 2 — Industrial Equipment", guideName: "Fasika Bekele" },
  { id: "FU-0003", inquiryId: "INQ-0004", callerName: "Abel Tesfaye", date: "2026-07-11", reminder: true, assignedOperator: OPERATORS[0], status: "Not Satisfied", notes: "Forwarded to finance for payment reconciliation.", createdDate: "2026-07-10", company: "Tesfaye Trading PLC", batch: "", guideName: "" },
  { id: "FU-0004", inquiryId: "INQ-0006", callerName: "Bereket Alemu", date: "2026-07-20", reminder: false, assignedOperator: OPERATORS[4], status: "Pending", notes: "Awaiting inspection report from operations team.", createdDate: "2026-07-16", company: "Alemu Construction", batch: "Batch 3 — Machinery", guideName: "Selam Tadesse" },
  { id: "FU-0005", inquiryId: "INQ-0008", callerName: "Nardos Fikre", date: "2026-07-25", reminder: true, assignedOperator: OPERATORS[2], status: "Satisfied", notes: "Catalogue emailed to customer.", createdDate: "2026-07-21", company: "Fikre Motors", batch: "Batch 1 — Vehicles", guideName: "Biruk Assefa" },
];

export const seedAppointments = [
  { id: "APT-0001", auction: AUCTIONS[1], visitorName: "Kalkidan Worku", phone: "0933445566", company: "Worku Imports", visitDate: "2026-08-01", visitTime: "10:00", assignedStaff: "Operations - Fasika", status: "Confirmed", notes: "Inspect lot 14, bring hard hat.", setupId: "VST-0001", batch: "Batch 2 — Industrial Equipment", guideName: "Fasika Bekele", guidePhone: "0911000111", address: "Kality Industrial Zone, Addis Ababa", items: "Lot 14 — CNC lathe, Lot 15 — air compressors" },
  { id: "APT-0002", auction: AUCTIONS[2], visitorName: "Marta Hailu", phone: "0922334455", company: "", visitDate: "2026-07-30", visitTime: "14:30", assignedStaff: "Operations - Biruk", status: "Requested", notes: "", setupId: "", batch: "", guideName: "", guidePhone: "", address: "", items: "" },
  { id: "APT-0003", auction: AUCTIONS[0], visitorName: "Nardos Fikre", phone: "0966778899", company: "Fikre Motors", visitDate: "2026-07-22", visitTime: "09:00", assignedStaff: "Operations - Fasika", status: "Completed", notes: "Viewed 3 vehicles.", setupId: "VST-0002", batch: "Batch 1 — Vehicles", guideName: "Biruk Assefa", guidePhone: "0922000222", address: "Fikre Motors Yard, Bole Road, Addis Ababa", items: "12 sedans and 4 pickup trucks" },
  { id: "APT-0004", auction: AUCTIONS[4], visitorName: "Bereket Alemu", phone: "0955667788", company: "Alemu Construction", visitDate: "2026-07-19", visitTime: "11:00", assignedStaff: "Operations - Selam", status: "No Show", notes: "Did not arrive, follow up scheduled.", setupId: "VST-0003", batch: "Batch 3 — Machinery", guideName: "Selam Tadesse", guidePhone: "0933000333", address: "Alemu Construction Depot, Akaki Kality", items: "2 excavators, 1 bulldozer, assorted tools" },
];

// Visit Setup: registered once per company/batch by the operator — the
// address, the item(s) out for auction, and the guide (with phone and
// availability) who walks visitors through the items in person. Visitor
// bookings on the Visitations page are made AGAINST one of these records,
// so the operator doesn't have to re-type the place/guide/time every time
// a visitor calls in.
export const seedVisitSetups = [
  {
    id: "VST-0001", company: "Worku Imports", batch: "Batch 2 — Industrial Equipment", date: "2026-08-05",
    address: "Kality Industrial Zone, Addis Ababa", items: "Lot 14 — CNC lathe, Lot 15 — air compressors",
    guideName: "Fasika Bekele", guidePhone: "0911000111", guideDays: ["Mon", "Wed", "Fri"],
    guideTimeFrom: "09:00", guideTimeTo: "13:00", createdBy: OPERATORS[2], createdDate: "2026-07-18",
  },
  {
    id: "VST-0002", company: "Fikre Motors", batch: "Batch 1 — Vehicles", date: "Every Tuesday, Thursday, Saturday until end of August",
    address: "Fikre Motors Yard, Bole Road, Addis Ababa", items: "12 sedans and 4 pickup trucks",
    guideName: "Biruk Assefa", guidePhone: "0922000222", guideDays: ["Tue", "Thu", "Sat"],
    guideTimeFrom: "10:00", guideTimeTo: "16:00", createdBy: OPERATORS[1], createdDate: "2026-07-20",
  },
  {
    id: "VST-0003", company: "Alemu Construction", batch: "Batch 3 — Machinery", date: "2026-08-10",
    address: "Alemu Construction Depot, Akaki Kality", items: "2 excavators, 1 bulldozer, assorted tools",
    guideName: "Selam Tadesse", guidePhone: "0933000333", guideDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    guideTimeFrom: "08:30", guideTimeTo: "12:00", createdBy: OPERATORS[4], createdDate: "2026-07-15",
  },
];

export const seedComplaints = [
  { id: "CMP-0001", inquiryId: "INQ-0006", callerName: "Bereket Alemu", phone: "0955667788", category: "Delivery / Item Condition", description: "Machinery condition did not match listing description.", department: "Auction Operations", priority: "High", status: "Open", resolution: "", resolutionDate: "", date: "2026-07-16" },
  { id: "CMP-0002", inquiryId: "INQ-0002", callerName: "Marta Hailu", phone: "0922334455", category: "Billing / Fees", description: "Processing fee charged twice on one invoice.", department: "Finance", priority: "Medium", status: "Resolved", resolution: "Duplicate charge reversed, confirmation sent.", resolutionDate: "2026-07-14", date: "2026-07-05" },
];

// Escalations: raised by a call operator when a caller's problem is
// caused by the auction company itself (not something the operator
// can fix). Auction Manager / Administrator review and resolve them,
// which sends a "fixed" notification back to the exact operator who
// raised it (see buildNotifications in hooks/useNotifications.js).
export const seedEscalations = [
  {
    id: "ESC-0001", inquiryId: "INQ-0006", callerName: "Bereket Alemu",
    operatorName: OPERATORS[4], createdByUsername: "meron",
    note: "Caller says the machinery listed as 'like new' arrived damaged — this is on the auction company's listing/inspection, not something I can resolve from here.",
    status: "Open", createdAt: Date.now() - 12 * 60 * 1000, resolutionNote: "", resolvedAt: null,
  },
  {
    id: "ESC-0002", inquiryId: "INQ-0004", callerName: "Abel Tesfaye",
    operatorName: OPERATORS[0], createdByUsername: "selamawit",
    note: "Payment isn't reflecting in the caller's account despite a confirmed bank transfer — needs Finance to check the auction company's ledger.",
    status: "Resolved", createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, resolutionNote: "Confirmed with Finance — payment was reflected under a mistyped reference number, now corrected and linked to the caller's account.", resolvedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  },
];

export const seedAuditLog = [
  { d: "2026-07-25", t: "12:16", u: "Yonas Tesfaye", r: "CRM / Call Center Officer", a: "Open inquiry", pv: "—", nv: "INQ-0010 created", rs: "Registration trouble reported by phone", ip: "10.0.0.31" },
  { d: "2026-07-23", t: "08:52", u: "Hana Girma", r: "CRM / Call Center Officer", a: "Assign inquiry", pv: "Open", nv: "Assigned", rs: "Picked up sealed-bid submission request", ip: "10.0.0.22" },
  { d: "2026-07-21", t: "15:47", u: "Hana Girma", r: "CRM / Call Center Officer", a: "Log inquiry", pv: "—", nv: "INQ-0008 created", rs: "Vehicle catalogue request", ip: "10.0.0.22" },
  { d: "2026-07-16", t: "09:31", u: "Meron Abebe", r: "CRM / Call Center Officer", a: "Convert to complaint", pv: "INQ-0006", nv: "CMP-0001 created", rs: "Item condition dispute forwarded to Auction Operations", ip: "10.0.0.44" },
  { d: "2026-07-14", t: "10:03", u: "A. Costa", r: "Finance Manager", a: "Resolve complaint", pv: "Open", nv: "Resolved", rs: "Duplicate processing fee reversed", ip: "172.16.4.22" },
  { d: "2026-07-10", t: "16:22", u: "Selamawit Bekele", r: "CRM / Call Center Officer", a: "Send to manager", pv: "Assigned", nv: "With Manager", rs: "Payment not reflecting, forwarded to Finance", ip: "10.0.0.11" },
];

// Each call-operator employee's `name` is kept identical to its entry in
// OPERATORS so a logged-in operator's username resolves to the exact
// display name used on inquiries/follow-ups/escalations.
export const seedEmployees = [
  { id: "EMP-0001", name: "Sara Admin", username: "admin", role: "administrator", status: "Active", lastPasswordChange: "2026-06-02", lastUsernameChange: "", privileges: rolePrivilegeDefaults.administrator },
  { id: "EMP-0002", name: OPERATORS[0], username: "selamawit", role: "call_operator", status: "Active", lastPasswordChange: "2026-04-22", lastUsernameChange: "", privileges: rolePrivilegeDefaults.call_operator },
  { id: "EMP-0003", name: OPERATORS[1], username: "dawit", role: "call_operator", status: "Active", lastPasswordChange: "2026-05-01", lastUsernameChange: "", privileges: rolePrivilegeDefaults.call_operator },
  { id: "EMP-0004", name: OPERATORS[2], username: "hana", role: "call_operator", status: "Active", lastPasswordChange: "2026-05-01", lastUsernameChange: "", privileges: rolePrivilegeDefaults.call_operator },
  { id: "EMP-0005", name: OPERATORS[3], username: "yonas", role: "call_operator", status: "Active", lastPasswordChange: "2026-05-01", lastUsernameChange: "", privileges: rolePrivilegeDefaults.call_operator },
  { id: "EMP-0006", name: OPERATORS[4], username: "meron", role: "call_operator", status: "Active", lastPasswordChange: "2026-05-01", lastUsernameChange: "", privileges: rolePrivilegeDefaults.call_operator },
  { id: "EMP-0007", name: "Auction Manager Account", username: "manager", role: "auction_manager", status: "Active", lastPasswordChange: "2026-06-15", lastUsernameChange: "", privileges: rolePrivilegeDefaults.auction_manager },
  { id: "EMP-0008", name: "Viewer Account", username: "viewer", role: "viewer", status: "Active", lastPasswordChange: "2026-03-11", lastUsernameChange: "", privileges: rolePrivilegeDefaults.viewer },
];