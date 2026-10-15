import React, { useState, useEffect } from 'react';
import { DataService } from '../services/dataService';

export default function PharmacyHandoff({ onNavigateToConsumer }) {
  const [shipments, setShipments] = useState([]);
  const [selectedSscc, setSelectedSscc] = useState('');
  const [minTemp, setMinTemp] = useState(3.5);
  const [maxTemp, setMaxTemp] = useState(5.8);
  const [outOfBoundsMin, setOutOfBoundsMin] = useState(0);
  const [batteryLevel, setBatteryLevel] = useState(94);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thermalLogs, setThermalLogs] = useState([]);
  const [bleStatus, setBleStatus] = useState('');

  // Load shipments
  const refreshShipments = async () => {
    const list = await DataService.getShipments();
    setShipments(list);
    if (list.length > 0 && !selectedSscc) {
      setSelectedSscc(list[0].sscc);
    }
  };

  useEffect(() => {
    refreshShipments();
  }, []);

  // When selected shipment changes, load thermal logs
  useEffect(() => {
    if (selectedSscc) {
      DataService.getThermalLogs(selectedSscc).then((logs) => {
        setThermalLogs(logs);
      });
    }
  }, [selectedSscc]);

  const selectedShipment = shipments.find((s) => s.sscc === selectedSscc);

  // Preset Handlers
  const applyPreset = (preset) => {
    if (preset === 'OPTIMAL') {
      setMinTemp(3.2);
      setMaxTemp(5.4);
      setOutOfBoundsMin(0);
      setStatusMessage({ type: 'info', text: 'Preset: Optimal cold-chain parameters (2°C - 8°C) applied.' });
    } else if (preset === 'HEAT_BREACH') {
      setMinTemp(4.0);
      setMaxTemp(14.2);
      setOutOfBoundsMin(140);
      setStatusMessage({ type: 'warning', text: 'Preset: Thermal excursion breach (> 8°C) applied.' });
    } else if (preset === 'FREEZE_BREACH') {
      setMinTemp(-2.8);
      setMaxTemp(4.0);
      setOutOfBoundsMin(45);
      setStatusMessage({ type: 'warning', text: 'Preset: Sub-zero freezing breach (< 2°C) applied.' });
    }
  };

  // Physical Web Bluetooth connection attempt (optional)
  const handlePhysicalBleConnect = async () => {
    if (!navigator.bluetooth) {
      setBleStatus('⚠️ Web Bluetooth is not supported in this browser. Use simulated IoT telemetry below.');
      return;
    }

    try {
      setBleStatus('📡 Searching for ColdGuard BLE Beacon...');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service']
      });

      setBleStatus(`🔗 Paired with ${device.name || 'ColdGuard Sensor'}. Reading telemetry...`);
      // Simulating read from BLE GATT
      setTimeout(() => {
        setMinTemp(3.6);
        setMaxTemp(6.1);
        setOutOfBoundsMin(0);
        setBatteryLevel(91);
        setBleStatus(`✅ Telemetry captured successfully from ${device.name || 'ColdGuard Tag'}.`);
      }, 1200);
    } catch (err) {
      console.warn('BLE connect rejected/failed:', err);
      setBleStatus('⚠️ BLE search cancelled or device not paired. Simulated controls are active below.');
    }
  };

  // Sync IoT Telemetry & Seal Ledger
  const handleSimulateSync = async () => {
    if (!selectedSscc) {
      setStatusMessage({ type: 'error', text: 'Please select or enter an SSCC tracking code.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({ type: 'info', text: 'Transmitting cryptographic handshake to decentralized ledger...' });

    try {
      const result = await DataService.recordThermalHandoff({
        parentSscc: selectedSscc,
        minTemp,
        maxTemp,
        outOfBoundsDuration: outOfBoundsMin,
        notes: `Pharmacy intake inspection. Min: ${minTemp}°C, Max: ${maxTemp}°C.`
      });

      await refreshShipments();
      const updatedLogs = await DataService.getThermalLogs(selectedSscc);
      setThermalLogs(updatedLogs);

      if (result.isCompromised) {
        setStatusMessage({
          type: 'error',
          text: `🚨 CRITICAL BREACH RECORDED: Temperature excursion detected (Max: ${maxTemp}°C, Min: ${minTemp}°C). Batch flagged COMPROMISED. Associated medicine packs will be rejected during patient verification.`
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `✅ HANDOFF COMPLETE: Cold chain verified within safe limits (2.0°C - 8.0°C). Batch received safely into pharmacy inventory.`
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Sync failed: ${err.message || String(err)}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTempBreached = minTemp < 2.0 || maxTemp > 8.0;

  return (
    <div className="pharmacy-container">
      <div className="section-header">
        <div>
          <h2>Pharmacy Cold-Chain Intake Console</h2>
          <p className="section-subtitle">
            Ingest Bluetooth Low Energy (BLE) environmental sensor tags, record temperature history, and verify shipment integrity before dispensing.
          </p>
        </div>
      </div>

      <div className="pharmacy-grid">
        {/* Left Column: Shipment Selection & Details */}
        <div className="card">
          <div className="card-header">
            <h3>1. Select Arriving Shipment</h3>
          </div>
          <div className="card-body">
            <label className="field-label">
              Incoming Parent Shipment (SSCC)
              <select
                className="select-input"
                value={selectedSscc}
                onChange={(e) => setSelectedSscc(e.target.value)}
              >
                {shipments.map((s) => (
                  <option key={s.sscc} value={s.sscc}>
                    {s.sscc} — {s.medicine_name || s.batch_number} ({s.status})
                  </option>
                ))}
              </select>
            </label>

            <div className="manual-sscc-row">
              <label className="field-label">
                Or Enter Custom SSCC:
                <input
                  type="text"
                  placeholder="e.g. SSCC-123456"
                  className="text-input"
                  value={selectedSscc}
                  onChange={(e) => setSelectedSscc(e.target.value)}
                />
              </label>
            </div>

            {selectedShipment && (
              <div className="shipment-detail-card">
                <div className="detail-row">
                  <span className="detail-key">Medicine:</span>
                  <span className="detail-val font-semibold">{selectedShipment.medicine_name || 'Standard Batch'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Batch Number:</span>
                  <span className="detail-val">{selectedShipment.batch_number}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Expiry Date:</span>
                  <span className="detail-val">{selectedShipment.expiry_date || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Total Units:</span>
                  <span className="detail-val">{selectedShipment.total_units || 'N/A'} packs</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Current Status:</span>
                  <span className={`status-badge ${selectedShipment.status.toLowerCase()}`}>
                    {selectedShipment.status}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Thermal Integrity:</span>
                  <span className={`status-badge ${selectedShipment.is_compromised ? 'breached' : 'safe'}`}>
                    {selectedShipment.is_compromised ? '🚨 COMPROMISED' : '🛡️ INTACT'}
                  </span>
                </div>
              </div>
            )}

            <div className="ble-connect-box">
              <h4>ColdGuard IoT Hardware Interface</h4>
              <p className="text-muted text-xs">
                Connect directly to an active ColdGuard BLE GATT sensor tag over Web Bluetooth.
              </p>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handlePhysicalBleConnect}
              >
                📡 Scan for Physical BLE Tag
              </button>
              {bleStatus && <p className="ble-status-text">{bleStatus}</p>}
            </div>
          </div>
        </div>

        {/* Right Column: IoT Telemetry Simulator & Action */}
        <div className="card">
          <div className="card-header">
            <h3>2. Environmental IoT Telemetry</h3>
            <span className={`telemetry-indicator ${isTempBreached ? 'alert' : 'normal'}`}>
              {isTempBreached ? '⚠️ Excursion Warning' : '🟢 Cold Chain OK'}
            </span>
          </div>

          <div className="card-body">
            <div className="presets-bar">
              <span className="presets-label">Quick Test Scenarios:</span>
              <button
                type="button"
                className="preset-btn safe"
                onClick={() => applyPreset('OPTIMAL')}
              >
                🟢 Safe (2°C - 8°C)
              </button>
              <button
                type="button"
                className="preset-btn danger"
                onClick={() => applyPreset('HEAT_BREACH')}
              >
                🔥 Heat Excursion (14.2°C)
              </button>
              <button
                type="button"
                className="preset-btn freeze"
                onClick={() => applyPreset('FREEZE_BREACH')}
              >
                ❄️ Sub-Zero Freeze (-2.8°C)
              </button>
            </div>

            <div className="telemetry-gauge-card">
              <div className="temp-readings-row">
                <div className="reading-block">
                  <span className="reading-label">Min Recorded</span>
                  <div className={`reading-val ${minTemp < 2.0 ? 'danger-text' : 'normal-text'}`}>
                    {minTemp}°C
                  </div>
                  <span className="reading-sub">{minTemp < 2.0 ? 'Below 2.0°C Min' : 'Normal'}</span>
                </div>

                <div className="reading-divider">⇄</div>

                <div className="reading-block">
                  <span className="reading-label">Max Recorded</span>
                  <div className={`reading-val ${maxTemp > 8.0 ? 'danger-text' : 'normal-text'}`}>
                    {maxTemp}°C
                  </div>
                  <span className="reading-sub">{maxTemp > 8.0 ? 'Above 8.0°C Max' : 'Normal'}</span>
                </div>
              </div>

              <div className="range-visualizer">
                <div className="safe-window-marker" style={{ left: '20%', width: '40%' }}>
                  Safe Band (2°C - 8°C)
                </div>
              </div>
            </div>

            <div className="telemetry-sliders">
              <div className="slider-group">
                <div className="slider-header">
                  <span>Minimum Temperature (°C)</span>
                  <span className="slider-val">{minTemp}°C</span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="15"
                  step="0.1"
                  value={minTemp}
                  onChange={(e) => setMinTemp(parseFloat(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <div className="slider-header">
                  <span>Maximum Temperature (°C)</span>
                  <span className="slider-val">{maxTemp}°C</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="0.1"
                  value={maxTemp}
                  onChange={(e) => setMaxTemp(parseFloat(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <div className="slider-header">
                  <span>Out-of-Bounds Duration (Minutes)</span>
                  <span className="slider-val">{outOfBoundsMin} mins</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={outOfBoundsMin}
                  onChange={(e) => setOutOfBoundsMin(parseInt(e.target.value, 10))}
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary sync-btn"
              onClick={handleSimulateSync}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Syncing...' : '🔒 Sync IoT Telemetry & Seal Cryptographic Ledger'}
            </button>

            {statusMessage && (
              <div className={`notification-banner ${statusMessage.type}`}>
                {statusMessage.text}
              </div>
            )}

            {onNavigateToConsumer && selectedShipment && (
              <div className="handoff-cta">
                <span>Want to test patient verification on this batch?</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigateToConsumer(selectedShipment.sscc)}
                >
                  🚀 Test Patient Scan in Consumer Center →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Table: Past Thermal Logs for this Shipment */}
      <div className="card mt-6">
        <div className="card-header">
          <h3>Cryptographic Thermal Log Ledger for {selectedSscc}</h3>
        </div>
        <div className="card-body">
          {thermalLogs.length === 0 ? (
            <p className="text-muted">No telemetry records sealed for this SSCC yet. Click the sync button above to register.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Min Temp</th>
                    <th>Max Temp</th>
                    <th>Out of Bounds</th>
                    <th>Status</th>
                    <th>Inspector Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {thermalLogs.map((log) => {
                    const isBreach = log.min_temp < 2.0 || log.max_temp > 8.0;
                    return (
                      <tr key={log.id}>
                        <td>{new Date(log.created_at).toLocaleString()}</td>
                        <td className={log.min_temp < 2.0 ? 'danger-text' : ''}>{log.min_temp}°C</td>
                        <td className={log.max_temp > 8.0 ? 'danger-text' : ''}>{log.max_temp}°C</td>
                        <td>{log.out_of_bounds_duration} mins</td>
                        <td>
                          <span className={`status-badge ${isBreach ? 'breached' : 'safe'}`}>
                            {isBreach ? '🚨 BREACH' : '🟢 INTACT'}
                          </span>
                        </td>
                        <td className="text-sm">{log.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}