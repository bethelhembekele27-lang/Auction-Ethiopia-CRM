
// Not every inquiry/visitation is about one specific auction — some callers
// just have a question about Auction Ethiopia itself. This keeps "Related
// auction" from forcing operators to pick an irrelevant auction in that case.
export const GENERAL_AUCTION_LABEL = "General — not about a specific auction (Auction Ethiopia)";


export const CATEGORIES = [
  "Auction Information", "Registration Support", "Bidder Registration", "Bid Submission",
  "Processing Fee Inquiry", "Payment Inquiry", "Visitation Appointment", "Technical Support",
  "Complaint", "General Inquiry", "Other",
];

export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const STATUSES = ["Open", "Assigned", "Pending Follow-up", "Waiting for Customer", "Resolved", "Closed", "With Manager"];
export const APPT_STATUSES = ["Requested", "Approved", "Confirmed", "Completed", "Cancelled"];

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