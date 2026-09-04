import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
/* --- generic export helpers used by the Reports report-builder --- */
export function rowsToCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRowsCSV(filenameBase, rows) {
  if (!rows.length) return;
  downloadFile(`${filenameBase}.csv`, rowsToCSV(rows), "text/csv;charset=utf-8;");
}

export function exportRowsPDF(title, rows) {
  if (!rows.length) return;
  const doc = new jsPDF({ orientation: "landscape" });
  const headers = Object.keys(rows[0]);

  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()} · ${rows.length} record(s)`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: rows.map((r) => headers.map((h) => String(r[h] ?? ""))),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [173, 127, 39], textColor: 255 }, // matches --brass
    alternateRowStyles: { fillColor: [249, 249, 247] },
  });

  const filename = `${title.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}