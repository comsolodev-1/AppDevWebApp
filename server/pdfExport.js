'use strict';
// Port of App_Code/PdfExport.vb (iTextSharp) using PDFKit. A4 landscape, 36pt margins.
const PDFDocument = require('pdfkit');
const ui = require('./ui');

const MARGIN = 36;

function send(res, report, fileName) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => {
    const bytes = Buffer.concat(chunks);
    const safeName = String(fileName).replace(/"/g, '').replace(/[\r\n]/g, '');
    res.status(200);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="' + safeName + '"',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store'
    });
    res.end(bytes);
  });

  const pageWidth = doc.page.width - MARGIN * 2;
  const center = (text, font, size, before, after) => {
    if (before) doc.y += before;
    doc.font(font).fontSize(size).fillColor('black').text(text, MARGIN, doc.y, { width: pageWidth, align: 'center', lineGap: size * 0.25 });
    if (after) doc.y += after;
  };

  center('Republic of the Philippines', 'Helvetica', 9);
  center('DILG Municipal Office of Talisay, Camarines Norte', 'Helvetica', 9);
  center(report.title, 'Helvetica-Bold', 15, 8);
  center(report.subtitle, 'Helvetica', 10, 0, 4);
  center('Generated ' + ui.nowText(), 'Helvetica', 9, 0, 10);

  for (const note of report.notes) {
    doc.font('Helvetica').fontSize(10).text(note, MARGIN, doc.y, { width: pageWidth, lineGap: 2.5 });
    doc.y += 6;
  }

  const columnCount = report.columns.length;
  if (columnCount > 0) {
    const colWidth = pageWidth / columnCount;
    const bottom = doc.page.height - MARGIN;

    const rowHeight = (cells, font, pad) => {
      doc.font(font).fontSize(9);
      let h = 0;
      for (const text of cells) h = Math.max(h, doc.heightOfString(text, { width: colWidth - pad * 2 }));
      return h + pad * 2;
    };

    const drawRow = (cells, font, pad, fill) => {
      const h = rowHeight(cells, font, pad);
      const y = doc.y;
      cells.forEach((text, i) => {
        const x = MARGIN + i * colWidth;
        if (fill) doc.rect(x, y, colWidth, h).fill(fill);
        doc.lineWidth(0.5).strokeColor('black').rect(x, y, colWidth, h).stroke();
        doc.fillColor('black').font(font).fontSize(9).text(text, x + pad, y + pad, { width: colWidth - pad * 2 });
      });
      doc.x = MARGIN;
      doc.y = y + h;
      return h;
    };

    const drawHeader = () => drawRow(report.columns.map(String), 'Helvetica-Bold', 5, 'rgb(230,242,236)');
    const fits = (h) => doc.y + h <= bottom;

    const headerH = rowHeight(report.columns.map(String), 'Helvetica-Bold', 5);
    if (!fits(headerH)) doc.addPage();
    drawHeader();

    for (const row of report.rows) {
      const cells = row.map((v) => (v === null || v === undefined ? '' : String(v)));
      const h = rowHeight(cells, 'Helvetica', 4);
      if (!fits(h)) {
        doc.addPage();
        drawHeader();
      }
      drawRow(cells, 'Helvetica', 4, null);
    }

    if (report.rows.length === 0) {
      const text = 'No records for the selected filters.';
      doc.font('Helvetica').fontSize(9);
      const h = doc.heightOfString(text, { width: pageWidth - 16 }) + 16;
      if (!fits(h)) doc.addPage();
      const y = doc.y;
      doc.lineWidth(0.5).strokeColor('black').rect(MARGIN, y, pageWidth, h).stroke();
      doc.fillColor('black').text(text, MARGIN + 8, y + 8, { width: pageWidth - 16 });
      doc.y = y + h;
    }
  }

  doc.end();
}

module.exports = { send };
