import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import logoUrl from "../constants/assets/logo.png";
import watermarkUrl from "../constants/assets/watermark.png";

export function rowsToCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
export function downloadFile(filename, content, mime) {
  // Excel ignores the "charset=utf-8" in the mime type and defaults to
  // reading unmarked CSVs as Windows-1252 — so any multi-byte UTF-8
  // character (the em-dash "—" placeholders this app uses for blank
  // Category/Priority/Auction cells being the main one) comes out
  // mangled as "â€"". A UTF-8 byte-order-mark at the very start of the
  // file is the standard way to make Excel specifically (Numbers/Google
  // Sheets already read UTF-8 correctly either way) detect and decode
  // it properly instead of guessing.
  const withBOM = mime.includes("csv") ? "\uFEFF" + content : content;
  const blob = new Blob([withBOM], { type: mime });
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

// Builds the exact same visual structure as the PFM backend's HTML
// template (logo, brand line, brass rule, title, meta, table, watermark)
// as a real off-screen DOM node, then rasterizes it with html2canvas.
// This sidesteps jsPDF/autoTable's styling quirks entirely — what you see
// in this HTML is exactly what ends up in the PDF, pixel for pixel.
function buildReportHTML(title, rows) {
  const headers = Object.keys(rows[0]);
  const headRow = headers.map((h) => `<th>${h}</th>`).join("");
  const bodyRows = rows.map((r) =>
    `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`
  ).join("");

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = "1050px"; // ~297mm at 90dpi-ish scale for html2canvas
  container.style.background = "#ffffff";
  container.style.fontFamily = "'Inter', Arial, sans-serif";
  container.style.padding = "28px 34px";
  container.style.boxSizing = "border-box";
  container.style.position = "fixed";

  container.innerHTML = `
    <div style="position:relative;">
      <img src="${logoUrl}" style="height:42px;display:block;margin-bottom:6px;" />
      <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:#63675F;text-transform:uppercase;margin-bottom:10px;">
        Auction Ethiopia — CRM / Call Center
      </div>
      <div style="height:3px;background:#AD7F27;width:100%;margin-bottom:16px;"></div>
      <h1 style="font-size:22px;margin:0 0 4px;color:#14171C;font-weight:700;">${title}</h1>
      <div style="font-size:12.5px;color:#AD7F27;margin-bottom:16px;">
        Generated ${new Date().toLocaleString()} · ${rows.length} record(s)
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;position:relative;z-index:1;">
        <thead>
          <tr style="background:#AD7F27;color:#fff;">${headRow}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <img src="${watermarkUrl}" style="position:absolute;left:-10px;bottom:-10px;width:220px;opacity:0.07;z-index:0;" />
    </div>
  `;

  // Inline style tag for table cell padding/borders — kept separate from
  // the inline styles above since <th>/<td> need repeated rules.
  const style = document.createElement("style");
  style.textContent = `
    table th, table td { padding: 9px 10px; text-align: left; }
    table th { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
    table td { border-bottom: 1px solid #DEE0DA; color: #1B1D1F; }
    table tr:nth-child(even) td { background: #F9F9F7; }
  `;
  container.prepend(style);

  document.body.appendChild(container);
  return container;
}
export async function exportRowsPDF(title, rows) {
  if (!rows.length) return;

  const node = buildReportHTML(title, rows);
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();   // 297
    const pageHeight = doc.internal.pageSize.getHeight(); // 210
    const margin = 12;

    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2 - 12; // leave room for footer

    const imgRatio = canvas.width / canvas.height;
    let drawW = maxW;
    let drawH = drawW / imgRatio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * imgRatio;
    }

    doc.addImage(imgData, "PNG", margin, margin, drawW, drawH);

    // Footer rule + branding/page number, so the empty space below the
    // table reads as an intentional document margin, not a blank page.
    doc.setDrawColor(222, 224, 218); // --border
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - margin, pageWidth - margin, pageHeight - margin);

    doc.setFontSize(8);
    doc.setTextColor(139, 142, 134); // --text-3
    doc.text("Auction Ethiopia — CRM / Call Center", margin, pageHeight - margin + 5);
    doc.text("Page 1 of 1", pageWidth - margin, pageHeight - margin + 5, { align: "right" });

    const filename = `${title.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  } finally {
    document.body.removeChild(node);
  }
}