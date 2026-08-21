import { todayISO } from "./format";

// Once a visitor's visit is registered, they automatically go onto the
// follow-up list so an operator calls back afterward and asks what they
// thought of the items — follow-up date defaults to the day after the
// visit. assignedOperator is the OPERATOR who registered the visit (not
// the guide), since operators are who follow-up reminders page.
//
// Used by both pages/Inquiries.jsx (Book visitation from inquiry) and
// pages/Visitations.jsx (Book visitation directly) — pull the copy that's
// still inline inside Visitations.jsx out and import it from here instead,
// so there's one source of truth.
export function autoFollowupForVisit(visit, genId, operatorName) {
  const base = new Date((visit.visitDate || todayISO()) + "T00:00:00");
  const next = isNaN(base) ? new Date() : new Date(base.getTime() + 86400000);
  return {
    id: genId("FU", "fu"),
    inquiryId: visit.id,
    callerName: visit.visitorName,
    date: next.toISOString().slice(0, 10),
    reminder: true,
    assignedOperator: operatorName || "",
    status: "Pending",
    notes: Follow up after the visit — ask ${visit.visitorName} what they thought of the items (${visit.batch || visit.auction || "—"}).,
    createdDate: todayISO(),
    company: visit.company || "",
    batch: visit.batch || "",
    guideName: visit.guideN visit.assignedStaff f || "",
  };
}