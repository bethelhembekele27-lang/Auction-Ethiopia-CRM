export const OPERATORS = ["Selamawit Bekele", "Dawit Alemu", "Hana Girma", "Yonas Tesfaye", "Meron Abebe"];

export const AUCTIONS = [
  "Vehicle Auction - July 2026",
  "Industrial Equipment Auction",
  "Real Estate Auction - Bole",
  "Electronics Liquidation",
  "Construction Machinery Auction",
];

// Not every inquiry/visitation is about one specific auction — some callers
// just have a question about Auction Ethiopia itself. This keeps "Related
// auction" from forcing operators to pick an irrelevant auction in that case.
export const GENERAL_AUCTION_LABEL = "General — not about a specific auction (Auction Ethiopia)";
export const AUCTION_SELECT_OPTIONS = [GENERAL_AUCTION_LABEL, ...AUCTIONS];

export const CATEGORIES = [
  "Auction Information", "Registration Support", "Bidder Registration", "Bid Submission",
  "Processing Fee Inquiry", "Payment Inquiry", "Visitation Appointment", "Technical Support",
  "Complaint", "General Inquiry", "Other",
];

export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const STATUSES = ["Open", "Assigned", "Pending Follow-up", "Waiting for Customer", "Resolved", "Closed", "With Manager"];
export const APPT_STATUSES = ["Requested", "Approved", "Confirmed", "Completed", "Cancelled"];

// Days the escort/guide is available to walk visitors through the items —
// used on Visit Setup records so the operator can see at a glance which
// days/times a guide covers for a given company + batch.
export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const COMPLAINT_CATEGORIES = ["Service Quality", "Billing / Fees", "Auction Process", "Staff Conduct", "Technical Issue", "Delivery / Item Condition", "Other"];
export const DEPARTMENTS = ["Call Center", "Finance", "Auction Operations", "IT Support", "Logistics", "Management"];

// Maps each status value to a CSS class suffix used by the shared .stamp component.
export const PRIORITY_STAMP = { Low: "gray", Medium: "blue", High: "amber", Urgent: "red" };
export const STATUS_STAMP = {
  Open: "blue", Assigned: "brass", "Pending Follow-up": "amber", "Waiting for Customer": "amber",
  Resolved: "green", Closed: "gray", "With Manager": "red",
};
export const APPT_STAMP = {
  Requested: "amber", Approved: "blue", Confirmed: "brass", Completed: "green", Cancelled: "gray", "No Show": "red",
};

// Follow-up outcome: a call starts "Pending" until the operator edits it and
// records what actually happened — only these three outcomes are choosable.
export const FOLLOWUP_STATUSES = ["Satisfied", "Not Satisfied", "No Show"];
export const FOLLOWUP_STAMP = { Pending: "amber", Satisfied: "green", "Not Satisfied": "red", "No Show": "red" };
