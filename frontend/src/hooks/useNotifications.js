import { useState, useMemo } from "react";
import { useNowTick } from "./useNowTick";
import { todayISO } from "../utils/format";

/* ================================================================
   NOTIFICATION CENTER
   One place that builds every notification the CURRENT user should
   see — their own overdue follow-up reminders, plus (for the Auction
   Manager only) newly-raised escalations, plus (for the operator who
   raised it) the fix notification once an escalation is resolved.
   Administrators don't get paged by these — they can still review
   everything from Manager Requests directly. Each item pops up as a
   floating card for its first 30 minutes, then quietly drops into
   the notification bell where it stays until someone clears it —
   nothing here is shared across users; only items addressed to the
   logged-in session are ever built.
================================================================= */
const THIRTY_MIN_MS = 30 * 60 * 1000;

export function buildNotifications(session, followups, escalations) {
  const items = [];
  const todayStr = todayISO();

  if (session.role === "call_operator" && session.operatorName) {
    followups
      .filter((f) => f.reminder && f.status === "Pending" && f.date <= todayStr && f.assignedOperator === session.operatorName)
      .forEach((f) => {
        items.push({
          id: `fu-${f.id}`,
          kind: "reminder",
          title: `${f.date < todayStr ? "Overdue" : "Due today"}: follow up with ${f.callerName}`,
          body: `${f.callerName} needs to be contacted regarding ${f.inquiryId}.`,
          createdAt: new Date(f.date + "T00:00:00").getTime(),
          link: "followups",
        });
      });
  }

  // Notifications are for the Auction Manager and operators only —
  // the Administrator can still open Manager Requests directly, but
  // doesn't get paged for every one raised.
  if (session.role === "auction_manager") {
    escalations
      .filter((e) => e.status === "Open")
      .forEach((e) => {
        items.push({
          id: `esc-new-${e.id}`,
          kind: "escalation_new",
          title: `New manager request from ${e.operatorName}`,
          body: `${e.inquiryId} (${e.callerName}) — "${e.note.slice(0, 80)}${e.note.length > 80 ? "…" : ""}"`,
          createdAt: e.createdAt,
          link: "escalations",
        });
      });
  }

  if (session.role === "call_operator") {
    escalations
      .filter((e) => e.status === "Resolved" && e.createdByUsername === session.username)
      .forEach((e) => {
        items.push({
          id: `esc-fixed-${e.id}`,
          kind: "escalation_resolved",
          title: `Manager request resolved — ${e.inquiryId}`,
          body: `The Auction Manager resolved your request on ${e.inquiryId} (${e.callerName}): "${(e.resolutionNote || "").slice(0, 80)}${(e.resolutionNote || "").length > 80 ? "…" : ""}"`,
          createdAt: e.resolvedAt || e.createdAt,
          link: "inquiries",
        });
      });
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export function useNotifications(session, followups, escalations) {
  const now = useNowTick(30000);
  const [poppedAway, setPoppedAway] = useState([]);
  const [dismissedFromBell, setDismissedFromBell] = useState([]);

  const all = useMemo(() => buildNotifications(session, followups, escalations), [session, followups, escalations]);

  const bellItems = all.filter((n) => !dismissedFromBell.includes(n.id));
  const popupItems = bellItems
    .filter((n) => !poppedAway.includes(n.id) && now - n.createdAt < THIRTY_MIN_MS)
    .slice(0, 4);

  function popAway(id) { setPoppedAway((p) => [...p, id]); }
  function clearFromBell(id) { setDismissedFromBell((d) => [...d, id]); }

  return { popupItems, bellItems, popAway, clearFromBell };
}