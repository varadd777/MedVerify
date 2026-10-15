import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';

// Helper: generate QR dataURL (PNG) or SVG string
export async function generateQRDataUrl(text, { type = 'png', scale = 4 } = {}) {
  if (type === 'svg') {
    // generate SVG string, then encode as data URL if needed
    const svg = await QRCode.toString(text, { type: 'svg', margin: 0, width: 300 });
    return { svg, dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
  } else {
    const dataUrl = await QRCode.toDataURL(text, { margin: 0, scale });
    return { svg: null, dataUrl };
  }
}

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

// CSV export
export async function exportCSV(labels, filename = 'labels.csv') {
  // labels: array of objects with serial_number, batch_number, medicine_name, expiry_date, qr_text
  const headers = Object.keys(labels[0] || {}).join(',');
  const rows = labels.map(l => Object.values(l).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const csv = headers + '\n' + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, filename);
}

// ZIP export with PNG and/or SVG per label
export async function exportZip(labels, { includePNG = true, includeSVG = false, filename = 'labels.zip', onProgress } = {}) {
  const zip = new JSZip();
  const total = labels.length;
  for (let i = 0; i < total; i++) {
    const label = labels[i];
    const baseName = `${label.batch_number || 'batch'}_${label.serial_number}`;
    const qrText = label.qr_text;
    if (includeSVG) {
      const { svg, dataUrl } = await generateQRDataUrl(qrText, { type: 'svg' });
      zip.file(`${baseName}.svg`, svg);
    }
    if (includePNG) {
      const { dataUrl } = await generateQRDataUrl(qrText, { type: 'png' });
      const blob = dataURLtoBlob(dataUrl);
      zip.file(`${baseName}.png`, blob);
    }
    if (onProgress) onProgress((i + 1) / total);
    // break between iterations to avoid blocking
    await new Promise(r => setTimeout(r, 0));
  }
  const content = await zip.generateAsync({ type: 'blob' }, (meta) => {
    if (onProgress) onProgress(0.5 + meta.percent / 200); // mid-progress map
  });
  saveAs(content, filename);
}

// PDF export: one label per page (simple)
export async function exportPDF(labels, { filename = 'labels.pdf', onProgress } = {}) {
  // We will generate PNG data urls for each QR and place image + text on a single page
  const pdf = new jsPDF({ unit: 'pt', format: 'A4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const qrText = label.qr_text;
    // generate PNG DataURL
    const { dataUrl } = await generateQRDataUrl(qrText, { type: 'png', scale: 6 });
    // Convert dataUrl to Image object
    const img = await loadImage(dataUrl);

    // Layout simple: image left, text on right
    const margin = 40;
    const imgW = 200;
    const imgH = (img.height / img.width) * imgW;
    const x = margin;
    const y = margin;

    // Draw image
    pdf.addImage(dataUrl, 'PNG', x, y, imgW, imgH);

    // Add textual fields (right side)
    const tx = x + imgW + 20;
    let ty = y + 10;
    pdf.setFontSize(12);
    pdf.text(`Serial: ${label.serial_number}`, tx, ty);
    ty += 18;
    pdf.text(`Batch: ${label.batch_number}`, tx, ty);
    ty += 18;
    pdf.text(`Medicine: ${label.medicine_name}`, tx, ty);
    ty += 18;
    pdf.text(`Expiry: ${label.expiry_date || ''}`, tx, ty);
    ty += 18;
    // Optionally print QR text URL
    pdf.setFontSize(8);
    pdf.text(label.qr_text, tx, ty, { maxWidth: pageW - tx - margin });

    if (i < labels.length - 1) pdf.addPage();
    if (onProgress) onProgress((i + 1) / labels.length);
    // yield to event loop
    await new Promise(r => setTimeout(r, 0));
  }

  const blob = pdf.output('blob');
  saveAs(blob, filename);
}

// helper to load image
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}