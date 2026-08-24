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
  const headers = Object.keys(rows[0]);
  const win = window.open("", "_blank");
  if (!win) return;
  const esc = (v) => String(v ?? "").replace(/</g, "&lt;");
  win.document.write(
    "<html><head><title>" + esc(title) + "</title><style>" +
    "body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#1B1D1F;}" +
    "h1{font-size:19px;margin:0 0 4px;} .meta{font-size:12px;color:#63675F;margin-bottom:18px;}" +
    "table{width:100%;border-collapse:collapse;font-size:12px;} th,td{border:1px solid #DEE0DA;padding:6px 8px;text-align:left;}" +
    "th{background:#F4EBD6;text-transform:uppercase;font-size:10.5px;letter-spacing:.03em;}" +
    "</style></head><body>" +
    "<h1>" + esc(title) + "</h1>" +
    "<div class=\"meta\">Generated " + esc(new Date().toLocaleString()) + " · " + rows.length + " record(s)</div>" +
    "<table><thead><tr>" + headers.map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + headers.map((h) => "<td>" + esc(r[h]) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></body></html>"
  );
  win.document.close();
  win.focus();
  win.print();
}