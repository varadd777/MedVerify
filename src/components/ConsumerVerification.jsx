import React, { useState, useEffect } from 'react';
import QRScanner from './QRScanner';
import { DataService, hashDeviceId } from '../services/dataService';

export default function ConsumerVerification({ initialSscc = null }) {
  const [activeTab, setActiveTab] = useState('demo'); // 'demo' | 'camera' | 'upload' | 'manual'
  const [deviceId, setDeviceId] = useState('user-device-abc');
  const [deviceHash, setDeviceHash] = useState('');
  
  // Data for quick testing
  const [shipments, setShipments] = useState([]);
  const [childItems, setChildItems] = useState([]);
  const [selectedParentFilter, setSelectedParentFilter] = useState(initialSscc || 'ALL');

  // Input fields for manual test
  const [manualGtin, setManualGtin] = useState('00312345678906');
  const [manualSerial, setManualSerial] = useState('000101');

  // Verification result state
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [scannedRaw, setScannedRaw] = useState('');

  // Compute device hash
  useEffect(() => {
    hashDeviceId(deviceId).then(setDeviceHash);
  }, [deviceId]);

  // Load items for demo testing
  const refreshItems = async () => {
    const sList = await DataService.getShipments();
    const cList = await DataService.getChildItems();
    setShipments(sList);
    setChildItems(cList);
  };

  useEffect(() => {
    refreshItems();
  }, []);

  // Filtered child items
  const displayItems = childItems.filter((item) => {
    if (selectedParentFilter === 'ALL') return true;
    return item.parent_sscc === selectedParentFilter;
  });

  // Execute verification
  const handleVerify = async (gtin, serial) => {
    if (!gtin || !serial) {
      setResult({
        verdict: 'ERROR',
        color: '#EF4444',
        title: '⚠️ Input Missing',
        message: 'Please provide both GTIN and Serial number to verify authenticity.'
      });
      return;
    }

    setVerifying(true);
    setResult(null);

    // Realistic verification delay simulation
    setTimeout(async () => {
      const outcome = await DataService.verifyItem({
        gtin: gtin.trim(),
        serial: serial.trim(),
        deviceId
      });
      setResult(outcome);
      setVerifying(false);
      await refreshItems();
    }, 400);
  };

  // Parse GS1 Digital Link URL or text
  const parseAndVerify = (rawText) => {
    if (!rawText) return;
    setScannedRaw(rawText);

    // Format: https://medverify.app/01/{GTIN}/21/{SERIAL} or /01/{gtin}/21/{serial}
    try {
      const urlParts = rawText.split('/');
      const gtinIdx = urlParts.indexOf('01');
      const serialIdx = urlParts.indexOf('21');

      if (gtinIdx !== -1 && serialIdx !== -1 && urlParts[gtinIdx + 1] && urlParts[serialIdx + 1]) {
        const g = urlParts[gtinIdx + 1];
        const s = urlParts[serialIdx + 1];
        setManualGtin(g);
        setManualSerial(s);
        handleVerify(g, s);
        return;
      }
    } catch {}

    // Fallback if plain text or raw serial
    const parts = rawText.trim().split(/[\s,]+/);
    if (parts.length === 2) {
      handleVerify(parts[0], parts[1]);
    } else {
      handleVerify(manualGtin, rawText.trim());
    }
  };

  return (
    <div className="consumer-container">
      <div className="section-header">
        <div>
          <h2>Consumer Medicine Verification & Anti-Counterfeit Center</h2>
          <p className="section-subtitle">
            Validate GS1 Digital Link labels, ensure cold-chain thermal integrity, and leverage cryptographic device-binding to detect counterfeit clones.
          </p>
        </div>
      </div>

      {/* Top Device Simulation Bar */}
      <div className="device-simulation-bar">
        <div className="device-info">
          <span className="device-label">Simulated Phone Device:</span>
          <select
            className="select-input-sm"
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              setResult(null);
            }}
          >
            <option value="user-device-abc">📱 Device A (Primary Patient / Authorized Buyer)</option>
            <option value="user-device-xyz">🕵️ Device B (Counterfeiter / Suspicious Clone Phone)</option>
            <option value="user-device-hospital">🏥 Device C (Hospital Inpatient Ward Terminal)</option>
          </select>
        </div>
        <div className="hash-display">
          <span className="hash-label">SHA-256 Fingerprint:</span>
          <code className="hash-code">{deviceHash.substring(0, 24)}...</code>
        </div>
      </div>

      <div className="consumer-grid">
        {/* Left Column: Verification Methods */}
        <div className="card">
          <div className="card-header border-b">
            <div className="tab-buttons">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'demo' ? 'active' : ''}`}
                onClick={() => setActiveTab('demo')}
              >
                ⚡ 1-Click Demo Pick
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
                onClick={() => setActiveTab('manual')}
              >
                ⌨️ Manual Entry
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'camera' ? 'active' : ''}`}
                onClick={() => setActiveTab('camera')}
              >
                📷 Live Camera
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
                onClick={() => setActiveTab('upload')}
              >
                🖼️ Upload QR Image
              </button>
            </div>
          </div>

          <div className="card-body">
            {/* Tab 1: 1-Click Demo Picker */}
            {activeTab === 'demo' && (
              <div className="demo-picker-section">
                <p className="instruction-text">
                  Select any serialized medicine pack below to instantly simulate patient verification. Test with <strong>Device A</strong>, then switch to <strong>Device B</strong> to demonstrate clone detection!
                </p>

                <div className="filter-row">
                  <span className="filter-label">Filter Batch:</span>
                  <select
                    className="select-input-sm"
                    value={selectedParentFilter}
                    onChange={(e) => setSelectedParentFilter(e.target.value)}
                  >
                    <option value="ALL">All Batches</option>
                    {shipments.map((s) => (
                      <option key={s.sscc} value={s.sscc}>
                        {s.sscc} ({s.medicine_name}) - {s.is_compromised ? '🚨 Compromised' : s.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="demo-items-list">
                  {displayItems.length === 0 ? (
                    <p className="text-muted">No child items found. Generate a batch in the Manufacturer tab first.</p>
                  ) : (
                    displayItems.map((item) => {
                      const parent = shipments.find((s) => s.sscc === item.parent_sscc);
                      const isComp = parent?.is_compromised;
                      return (
                        <div key={`${item.gtin}-${item.serial}`} className="demo-item-card">
                          <div className="item-meta">
                            <span className="item-serial font-mono">Serial: #{item.serial}</span>
                            <span className="item-parent">{parent?.medicine_name || item.parent_sscc}</span>
                            <div className="item-tags">
                              <span className={`status-badge-sm ${item.status.toLowerCase()}`}>
                                {item.status}
                              </span>
                              {isComp && <span className="status-badge-sm breached">Cold Breach</span>}
                              {item.device_id_hash && <span className="status-badge-sm bound">Device Bound</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setManualGtin(item.gtin);
                              setManualSerial(item.serial);
                              handleVerify(item.gtin, item.serial);
                            }}
                          >
                            Verify Pack 🔍
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Manual Input */}
            {activeTab === 'manual' && (
              <div className="manual-entry-section">
                <label className="field-label">
                  GS1 Global Trade Item Number (GTIN)
                  <input
                    type="text"
                    className="text-input"
                    value={manualGtin}
                    onChange={(e) => setManualGtin(e.target.value)}
                    placeholder="e.g. 00312345678906"
                  />
                </label>

                <label className="field-label mt-3">
                  Unique Unit Serial Number
                  <input
                    type="text"
                    className="text-input font-mono"
                    value={manualSerial}
                    onChange={(e) => setManualSerial(e.target.value)}
                    placeholder="e.g. 000101"
                  />
                </label>

                <div className="quick-suggestions mt-3">
                  <span className="text-xs text-muted">Try sample:</span>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      setManualGtin('00312345678906');
                      setManualSerial('000102');
                    }}
                  >
                    Safe Pack (#000102)
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      setManualGtin('00312345678906');
                      setManualSerial('000201');
                    }}
                  >
                    Breached Pack (#000201)
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      setManualGtin('00312345678906');
                      setManualSerial('999999');
                    }}
                  >
                    Fake Serial (#999999)
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-primary w-full mt-4"
                  onClick={() => handleVerify(manualGtin, manualSerial)}
                  disabled={verifying}
                >
                  {verifying ? 'Verifying with Ledger...' : '🛡️ Verify Authenticity & Thermal Safety'}
                </button>
              </div>
            )}

            {/* Tab 3: Camera Scanner */}
            {activeTab === 'camera' && (
              <div className="camera-section">
                <p className="text-sm text-muted mb-2">
                  Point camera at the 2D DataMatrix or QR code on the medicine carton.
                </p>
                <div className="scanner-frame">
                  <QRScanner onDetected={parseAndVerify} />
                </div>
              </div>
            )}

            {/* Tab 4: Upload Image */}
            {activeTab === 'upload' && (
              <div className="upload-section">
                <p className="text-sm text-muted mb-2">
                  Upload a photo or screenshot containing the medicine label QR code.
                </p>
                <QRScanner onDetected={parseAndVerify} />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Verification Certificate & Decision */}
        <div className="card">
          <div className="card-header">
            <h3>Authenticity & Safety Certificate</h3>
            {result && (
              <span className={`status-badge ${result.verdict.toLowerCase()}`}>
                {result.verdict}
              </span>
            )}
          </div>

          <div className="card-body">
            {verifying && (
              <div className="verification-loading">
                <div className="spinner"></div>
                <p>Querying decentralized pharmaceutical ledger & thermal logs...</p>
              </div>
            )}

            {!verifying && !result && (
              <div className="verification-empty-state">
                <div className="empty-icon">🛡️</div>
                <h4>Awaiting Medicine Scan</h4>
                <p>Choose an item from the 1-Click Demo Pick or scan a QR code to inspect authenticity, expiration, and cold-chain compliance.</p>
              </div>
            )}

            {!verifying && result && (
              <div className="verification-result-box">
                {/* Verdict Banner */}
                <div
                  className="verdict-banner"
                  style={{
                    backgroundColor: result.color,
                    color: '#FFFFFF'
                  }}
                >
                  <h4 className="verdict-title">{result.title}</h4>
                  <p className="verdict-message">{result.message}</p>
                </div>

                {/* Product Credentials */}
                {result.item && (
                  <div className="credentials-card">
                    <h4>Pharmaceutical Provenance Details</h4>
                    <div className="credential-row">
                      <span className="cred-key">Drug / Medicine:</span>
                      <span className="cred-val font-semibold">{result.parent?.medicine_name || 'Standard Serialization'}</span>
                    </div>
                    <div className="credential-row">
                      <span className="cred-key">Batch / SSCC:</span>
                      <span className="cred-val font-mono">{result.item.parent_sscc}</span>
                    </div>
                    <div className="credential-row">
                      <span className="cred-key">GTIN:</span>
                      <span className="cred-val font-mono">{result.item.gtin}</span>
                    </div>
                    <div className="credential-row">
                      <span className="cred-key">Serial Number:</span>
                      <span className="cred-val font-mono font-bold">#{result.item.serial}</span>
                    </div>
                    <div className="credential-row">
                      <span className="cred-key">Expiry Date:</span>
                      <span className="cred-val">{result.parent?.expiry_date || 'Unspecified'}</span>
                    </div>
                    <div className="credential-row">
                      <span className="cred-key">Cold Chain Audit:</span>
                      <span className={`status-badge-sm ${result.parent?.is_compromised ? 'breached' : 'safe'}`}>
                        {result.parent?.is_compromised ? '🚨 EXCURSION BREACH (> 8°C)' : '🟢 VERIFIED SAFE (2°C - 8°C)'}
                      </span>
                    </div>
                    <div className="credential-row">
                      <span className="cred-key">Unit Lifecycle Status:</span>
                      <span className={`status-badge-sm ${result.item.status.toLowerCase()}`}>
                        {result.item.status}
                      </span>
                    </div>
                    {result.deviceHash && (
                      <div className="credential-row">
                        <span className="cred-key">Device Signature:</span>
                        <code className="text-xs text-muted font-mono">{result.deviceHash.substring(0, 20)}...</code>
                      </div>
                    )}
                  </div>
                )}

                {/* Actionable Guidance */}
                <div className="guidance-box">
                  {result.verdict.startsWith('AUTHENTIC') && (
                    <p className="guidance-text safe">
                      ✅ <strong>Safe for administration:</strong> Package integrity, serialization, and cold-chain compliance are confirmed.
                    </p>
                  )}
                  {result.verdict === 'THERMAL_BREACH' && (
                    <p className="guidance-text danger">
                      ⚠️ <strong>Do NOT Administer:</strong> Return this medicine to the pharmacy immediately. The cold-chain temperature thresholds were exceeded during logistics.
                    </p>
                  )}
                  {result.verdict === 'CLONE_DETECTED' && (
                    <p className="guidance-text danger">
                      🚨 <strong>Suspected Counterfeit:</strong> The QR label on this package appears to be an unauthorized duplicate of an already consumed pack. Hand over to regulatory authorities.
                    </p>
                  )}
                  {result.verdict === 'COUNTERFEIT' && (
                    <p className="guidance-text danger">
                      🛑 <strong>Unregistered Product:</strong> This product was not issued by any verified pharmaceutical manufacturer in the network.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-secondary w-full mt-3"
                  onClick={() => setResult(null)}
                >
                  Verify Another Item
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}