import React, { useState, useRef, useEffect } from 'react';
import { DataService } from '../services/dataService';
import { renderTemplate } from '../utils/labelTemplate';
import { generateQRDataUrl, exportCSV, exportZip, exportPDF } from '../utils/exporters';

// Default label template (GS1 style placeholders)
const DEFAULT_TEMPLATE = `
{{medicine_name}}
Batch: {{batch_number}}
Serial: {{serial_number}}
Expiry: {{expiry_date}}
GS1 Link: {{qr}}
`.trim();

export default function ManufacturerSerialization({ onNavigateToPharmacy }) {
  const [gtin, setGtin] = useState('00312345678906');
  const [quantity, setQuantity] = useState(10);
  const [batchNumber, setBatchNumber] = useState(`BATCH-${Math.floor(100000 + Math.random() * 900000)}`);
  const [medicineName, setMedicineName] = useState('Amoxicillin 500mg Capsules');
  const [expiryDate, setExpiryDate] = useState('2027-08-30');
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [labelsPreview, setLabelsPreview] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [existingBatches, setExistingBatches] = useState([]);
  const labelsRef = useRef([]);

  // Load existing batches
  const loadExisting = async () => {
    const list = await DataService.getShipments();
    setExistingBatches(list);
  };

  useEffect(() => {
    loadExisting();
  }, []);

  function makeSerial(i) {
    return String(i).padStart(6, '0');
  }

  function buildQrText(gtinVal, serial) {
    return `https://medverify.app/01/${gtinVal}/21/${serial}`;
  }

  async function generateLabelsAndInsert() {
    if (!gtin || !quantity || !batchNumber) {
      setStatus('⚠️ Please fill in all required fields (GTIN, Batch, Quantity).');
      return;
    }

    setIsGenerating(true);
    setStatus('Initializing serialization batch in ledger...');
    setGeneratedCount(0);
    setProgress(0);
    labelsRef.current = [];
    setLabelsPreview([]);

    const ssccCode = `SSCC-${batchNumber.replace('BATCH-', '')}`;

    // 1) Upsert Parent Shipment
    const parentPayload = {
      sscc: ssccCode,
      batch_number: batchNumber,
      medicine_name: medicineName || 'Standard Medication',
      expiry_date: expiryDate || '2028-01-01',
      status: 'IN_TRANSIT',
      is_compromised: false,
      total_units: Number(quantity)
    };

    try {
      await DataService.upsertShipment(parentPayload);
    } catch (err) {
      console.error('Parent upsert error', err);
      setIsGenerating(false);
      setStatus(`❌ Parent creation failed: ${err.message || String(err)}`);
      return;
    }

    // 2) Generate Child Items and QR previews
    const CHUNK = 100;
    let inserted = 0;
    const allChildren = [];
    const allLabels = [];

    try {
      for (let start = 1; start <= quantity; start += CHUNK) {
        const chunkEnd = Math.min(quantity, start + CHUNK - 1);
        const childChunk = [];
        const labelChunk = [];

        for (let i = start; i <= chunkEnd; i++) {
          const serial = makeSerial(i);
          const qrText = buildQrText(gtin, serial);

          childChunk.push({
            gtin,
            serial,
            parent_sscc: ssccCode,
            status: 'IN_TRANSIT',
            device_id_hash: null,
            first_scanned_at: null
          });

          const labelCtx = {
            qr: qrText,
            serial_number: serial,
            batch_number: batchNumber,
            medicine_name: medicineName,
            expiry_date: expiryDate
          };

          labelChunk.push({
            serial_number: serial,
            batch_number: batchNumber,
            medicine_name: medicineName,
            expiry_date: expiryDate,
            qr_text: qrText,
            rendered: renderTemplate(template, labelCtx)
          });
        }

        await DataService.upsertChildItems(childChunk);
        allChildren.push(...childChunk);
        allLabels.push(...labelChunk);

        inserted += labelChunk.length;
        setGeneratedCount(inserted);
        setProgress(inserted / quantity);

        await new Promise((r) => setTimeout(r, 20));
      }

      labelsRef.current = allLabels;

      // Generate visual QR image for the first 8 preview items
      setStatus('Generating high-resolution QR preview images...');
      const previewSlice = allLabels.slice(0, 8);
      const withQrs = [];
      for (const item of previewSlice) {
        try {
          const { dataUrl } = await generateQRDataUrl(item.qr_text, { type: 'png', scale: 4 });
          withQrs.push({ ...item, qrDataUrl: dataUrl });
        } catch {
          withQrs.push({ ...item, qrDataUrl: null });
        }
      }
      setLabelsPreview(withQrs);

      setIsGenerating(false);
      setStatus(`✅ Success: Generated ${inserted} serialized units for ${batchNumber} (${ssccCode}).`);
      await loadExisting();
    } catch (err) {
      console.error('Child insertion error', err);
      setIsGenerating(false);
      setStatus(`❌ Generation error: ${err.message || String(err)}`);
    }
  }

  // Exports
  async function handleExportCSV() {
    if (!labelsRef.current.length) return setStatus('⚠️ No labels generated yet. Create a batch first.');
    setStatus('Exporting CSV manifest...');
    await exportCSV(
      labelsRef.current.map((l) => ({
        serial_number: l.serial_number,
        batch_number: l.batch_number,
        medicine_name: l.medicine_name,
        expiry_date: l.expiry_date,
        qr_text: l.qr_text
      })),
      `${batchNumber}_manifest.csv`
    );
    setStatus('✅ CSV Manifest exported.');
  }

  async function handleExportZipPNG() {
    if (!labelsRef.current.length) return setStatus('⚠️ No labels generated yet. Create a batch first.');
    setStatus('Generating ZIP package with QR PNGs...');
    await exportZip(
      labelsRef.current.map((l) => ({
        serial_number: l.serial_number,
        batch_number: l.batch_number,
        medicine_name: l.medicine_name,
        expiry_date: l.expiry_date,
        qr_text: l.qr_text
      })),
      { includePNG: true, includeSVG: false, filename: `${batchNumber}_qr_png.zip`, onProgress: (p) => setProgress(p) }
    );
    setStatus('✅ ZIP (PNG) exported.');
  }

  async function handleExportZipSVGPNG() {
    if (!labelsRef.current.length) return setStatus('⚠️ No labels generated yet. Create a batch first.');
    setStatus('Generating full SVG + PNG production package...');
    await exportZip(
      labelsRef.current.map((l) => ({
        serial_number: l.serial_number,
        batch_number: l.batch_number,
        medicine_name: l.medicine_name,
        expiry_date: l.expiry_date,
        qr_text: l.qr_text
      })),
      { includePNG: true, includeSVG: true, filename: `${batchNumber}_production_bundle.zip`, onProgress: (p) => setProgress(p) }
    );
    setStatus('✅ Production Bundle (SVG+PNG) exported.');
  }

  async function handleExportPDF() {
    if (!labelsRef.current.length) return setStatus('⚠️ No labels generated yet. Create a batch first.');
    setStatus('Rendering printable PDF label sheets...');
    await exportPDF(
      labelsRef.current.map((l) => ({
        serial_number: l.serial_number,
        batch_number: l.batch_number,
        medicine_name: l.medicine_name,
        expiry_date: l.expiry_date,
        qr_text: l.qr_text
      })),
      { filename: `${batchNumber}_print_labels.pdf`, onProgress: (p) => setProgress(p) }
    );
    setStatus('✅ Printable PDF Label Sheets exported.');
  }

  const ssccPreview = `SSCC-${batchNumber.replace('BATCH-', '')}`;

  return (
    <div className="manufacturer-container">
      <div className="section-header">
        <div>
          <h2>Manufacturer Serialization & Packaging Control Center</h2>
          <p className="section-subtitle">
            Create decentralized pharmaceutical shipments, serialize individual drug cartons with GS1 Digital Links, and export production print bundles.
          </p>
        </div>
      </div>

      <div className="manufacturer-grid">
        {/* Left Column: Form & Configuration */}
        <div className="card">
          <div className="card-header">
            <h3>1. Batch & Serialization Parameters</h3>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <label className="field-label">
                Medicine Name & Dosage
                <input
                  type="text"
                  className="text-input"
                  value={medicineName}
                  onChange={(e) => setMedicineName(e.target.value)}
                  placeholder="e.g. Amoxicillin 500mg Capsules"
                />
              </label>

              <label className="field-label">
                GS1 GTIN (Global Trade Item Number)
                <input
                  type="text"
                  className="text-input font-mono"
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  placeholder="14-digit GTIN"
                />
              </label>

              <div className="form-row-2">
                <label className="field-label">
                  Batch Number
                  <input
                    type="text"
                    className="text-input font-mono"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                  />
                </label>

                <label className="field-label">
                  Units to Serialize
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    className="text-input"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="form-row-2">
                <label className="field-label">
                  Expiry Date
                  <input
                    type="date"
                    className="text-input"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </label>

                <label className="field-label">
                  Assigned SSCC Container Code
                  <input
                    type="text"
                    className="text-input font-mono bg-disabled"
                    value={ssccPreview}
                    readOnly
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={generateLabelsAndInsert}
                disabled={isGenerating}
              >
                {isGenerating ? 'Serializing Units...' : '⚡ Generate Batch & Serialized QR Codes'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setBatchNumber(`BATCH-${Math.floor(100000 + Math.random() * 900000)}`)}
              >
                🎲 New Batch ID
              </button>
            </div>

            {/* Progress Bar */}
            {isGenerating && (
              <div className="progress-container mt-3">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.round((progress || 0) * 100)}%` }}
                  />
                </div>
                <div className="progress-text">
                  Processing: {generatedCount} / {quantity} units ({Math.round((progress || 0) * 100)}%)
                </div>
              </div>
            )}

            {status && (
              <div className="status-banner mt-3">
                {status}
              </div>
            )}

            {/* Direct Handoff to Pharmacy Shortcut */}
            {labelsRef.current.length > 0 && onNavigateToPharmacy && (
              <div className="handoff-box mt-4">
                <p className="text-sm font-semibold text-emerald-400">
                  Batch {batchNumber} is serialized and marked IN_TRANSIT.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm mt-1"
                  onClick={() => onNavigateToPharmacy(ssccPreview)}
                >
                  🚀 Dispatch to Pharmacy Intake Console →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Template & Export Center */}
        <div className="card">
          <div className="card-header">
            <h3>2. Label Template & Production Exports</h3>
          </div>
          <div className="card-body">
            <label className="field-label">
              Label Template Customizer (HTML / Free-text)
              <textarea
                className="text-area font-mono text-xs"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={5}
              />
            </label>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-muted">Supports: &#123;&#123;medicine_name&#125;&#125;, &#123;&#123;batch_number&#125;&#125;, &#123;&#123;serial_number&#125;&#125;, &#123;&#123;expiry_date&#125;&#125;, &#123;&#123;qr&#125;&#125;</span>
              <button
                type="button"
                className="btn-link text-xs"
                onClick={() => setTemplate(DEFAULT_TEMPLATE)}
              >
                Reset Default
              </button>
            </div>

            <div className="export-section mt-4">
              <h4>Download Manufacturing Bundles:</h4>
              <div className="export-buttons-grid">
                <button
                  type="button"
                  className="btn btn-export"
                  onClick={handleExportCSV}
                  disabled={!labelsRef.current.length}
                >
                  📄 Export CSV Manifest
                </button>
                <button
                  type="button"
                  className="btn btn-export"
                  onClick={handleExportPDF}
                  disabled={!labelsRef.current.length}
                >
                  📑 Export PDF Labels
                </button>
                <button
                  type="button"
                  className="btn btn-export"
                  onClick={handleExportZipPNG}
                  disabled={!labelsRef.current.length}
                >
                  📦 Export ZIP (PNG QRs)
                </button>
                <button
                  type="button"
                  className="btn btn-export"
                  onClick={handleExportZipSVGPNG}
                  disabled={!labelsRef.current.length}
                >
                  🗂️ Production (SVG+PNG)
                </button>
              </div>
            </div>

            {/* Live QR Label Previews */}
            <div className="preview-section mt-4">
              <h4>Label Preview (First Items in Batch):</h4>
              {labelsPreview.length === 0 ? (
                <div className="empty-preview-box">
                  No preview generated yet. Enter parameters and click <strong>Generate Batch</strong> above.
                </div>
              ) : (
                <div className="preview-cards-scroller">
                  {labelsPreview.map((item) => (
                    <div key={item.serial_number} className="label-preview-card">
                      <div className="qr-wrapper">
                        {item.qrDataUrl ? (
                          <img src={item.qrDataUrl} alt={`QR #${item.serial_number}`} />
                        ) : (
                          <div className="qr-placeholder">QR Loading...</div>
                        )}
                      </div>
                      <div className="label-content">
                        <div className="label-med">{item.medicine_name}</div>
                        <div className="label-meta">Batch: {item.batch_number}</div>
                        <div className="label-meta font-mono font-bold">Serial: #{item.serial_number}</div>
                        <div className="label-meta">Exp: {item.expiry_date}</div>
                        <div className="label-digital-link text-xs font-mono">{item.qr_text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Existing Batches in Ledger */}
      <div className="card mt-6">
        <div className="card-header">
          <h3>Active Manufacturer Shipments in Ledger</h3>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SSCC Code</th>
                  <th>Batch Number</th>
                  <th>Medicine</th>
                  <th>Expiry Date</th>
                  <th>Total Units</th>
                  <th>Current Status</th>
                  <th>Cold Chain Integrity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {existingBatches.map((b) => (
                  <tr key={b.sscc}>
                    <td className="font-mono">{b.sscc}</td>
                    <td className="font-mono">{b.batch_number}</td>
                    <td className="font-semibold">{b.medicine_name || 'Standard Batch'}</td>
                    <td>{b.expiry_date || '—'}</td>
                    <td>{b.total_units || '8'} units</td>
                    <td>
                      <span className={`status-badge ${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${b.is_compromised ? 'breached' : 'safe'}`}>
                        {b.is_compromised ? '🚨 COMPROMISED' : '🟢 INTACT'}
                      </span>
                    </td>
                    <td>
                      {onNavigateToPharmacy && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => onNavigateToPharmacy(b.sscc)}
                        >
                          Intake at Pharmacy ➔
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}