import React from "react";
import { StatCard } from "../components/ui";
import { OPERATORS } from "../constants/lookups";
import { countBy, daysBetween } from "../utils/format";

// Reads: inquiries, followups, appointments, complaints — same shape as
// every other page. Purely a read-only rollup, no writes/audit here.
export default function Dashboard({ inquiries, followups, appointments, complaints }) {
  const openComplaints = complaints.filter((c) => c.status !== "Resolved").length;
  const resolvedComplaints = complaints.filter((c) => c.status === "Resolved").length;

  const operatorPerf = OPERATORS.map((op) => {
    const mine = inquiries.filter((i) => i.operator === op);
    const resolved = mine.filter((i) => ["Resolved", "Closed"].includes(i.status));
    const withTime = resolved.filter((i) => i.resolvedDate);
    const avg = withTime.length
      ? (withTime.reduce((s, i) => s + daysBetween(i.dateTime, i.resolvedDate), 0) / withTime.length).toFixed(1)
      : "—";
    return {
      operator: op,
      total: mine.length,
      resolved: resolved.length,
      open: mine.length - resolved.length,
      rate: mine.length ? Math.round((resolved.length / mine.length) * 100) : 0,
      avgDays: avg,
    };
  });

  return (
    <div>
      <div className="grid gap-4 grid-cols-[1.3fr_1fr] mobile:grid-cols-1" style={{ marginBottom: 16 }}>
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-[18px]">
          <h3 style={{ margin: "0 0 4px" }}>Calls by operator</h3>
          {countBy(inquiries, "operator").map((d) => (
            <div className="flex items-center gap-2.5 my-2.5 text-[13px]" key={d.name}>
              <span className="w-[150px] shrink-0 text-[color:var(--text-2)] whitespace-nowrap overflow-hidden text-ellipsis">{d.name}</span>
              <div className="flex-1 h-2 bg-[color:var(--gray-bg)] rounded overflow-hidden">
                <div className="h-full bg-[color:var(--brass)] rounded" style={{ width: ${(d.value / inquiries.length) * 100}% }}></div>
              </div>
              <span className="w-9 text-right font-mono text-[12.5px] text-[color:var(--text-2)]">{d.value}</span>
            </div>
          ))}
        </div>
        <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] p-[18px]">
          <h3 style={{ margin: "0 0 4px" }}>Complaint status</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatCard label="Open complaints" value={openComplaints} tone={openComplaints ? "warn" : "up"} />
            <StatCard label="Resolved" value={resolvedComplaints} tone="up" />
            <StatCard label="Total complaints" value={complaints.length} />
          </div>
        </div>
      </div>

      <div className="bg-[color:var(--panel)] border border-[color:var(--border)] rounded-[10px] overflow-hidden">
        <div style={{ padding: "16px 18px 4px" }}>
          <h3 style={{ margin: 0 }}>Operator performance</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full border-collapse text-[13px] min-w-[640px]">
            <thead>
              <tr className="group">
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Operator</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Total handled</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Resolved</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Open</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Resolution rate</th>
                <th className="text-left text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-2)] font-semibold py-2.5 px-3 border-b border-[color:var(--border)]">Avg. resolution (days)</th>
              </tr>
            </thead>
            <tbody>
              {operatorPerf.map((o) => (
                <tr key={o.operator} className="group">
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">{o.operator}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{o.total}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{o.resolved}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{o.open}</td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616]">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="flex-1 h-2 bg-[color:var(--gray-bg)] rounded overflow-hidden" style={{ width: 80 }}>
                        <div className="h-full bg-[color:var(--brass)] rounded" style={{ width: ${o.rate}% }}></div>
                      </div>
                      <span className="font-mono" style={{ fontSize: 12 }}>{o.rate}%</span>
                    </div>
                  </td>
                  <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle group-hover:bg-[#F9F9F7] dark:group-hover:bg-[#161616] font-mono">{o.avgDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}