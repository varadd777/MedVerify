import React, { useState, useEffect } from 'react';
import { DataService } from '../services/dataService';

export default function SupplyChainLedger({ onVerifyItem }) {
  const [shipments, setShipments] = useState([]);
  const [childItems, setChildItems] = useState([]);
  const [thermalLogs, setThermalLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedItem, setSelectedItem] = useState(null);
  const [notification, setNotification] = useState('');

  const loadAllData = async () => {
    const s = await DataService.getShipments();
    const c = await DataService.getChildItems();
    const l = await DataService.getThermalLogs();
    setShipments(s);
    setChildItems(c);
    setThermalLogs(l);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleResetData = () => {
    if (window.confirm('Reset supply chain database to clean initial demo state? This will restore sample batches and clear anomaly flags.')) {
      DataService.resetToInitial();
      loadAllData();
      setSelectedItem(null);
      setNotification('✅ Supply chain ledger reset to initial clean demo dataset.');
      setTimeout(() => setNotification(''), 4000);
    }
  };

  // KPIs
  const totalShipments = shipments.length;
  const totalUnits = childItems.length;
  const inTransitCount = childItems.filter((i) => i.status === 'IN_TRANSIT').length;
  const inPharmacyCount = childItems.filter((i) => i.status === 'RECEIVED_AT_PHARMACY').length;
  const activatedCount = childItems.filter((i) => i.status === 'ACTIVATED').length;
  const burnedCount = childItems.filter((i) => i.status === 'BURNED_ANOMALY').length;
  const compromisedBatches = shipments.filter((s) => s.is_compromised).length;

  // Filter child items
  const filteredItems = childItems.filter((item) => {
    const parent = shipments.find((s) => s.sscc === item.parent_sscc);
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      item.serial.toLowerCase().includes(term) ||
      item.gtin.toLowerCase().includes(term) ||
      item.parent_sscc.toLowerCase().includes(term) ||
      (parent?.medicine_name && parent.medicine_name.toLowerCase().includes(term));

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="ledger-container">
      <div className="section-header">
        <div>
          <h2>Supply Chain Audit Ledger & Analytics</h2>
          <p className="section-subtitle">
            Cryptographic audit trail tracking pharmaceutical batches from factory floor to patient administration.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleResetData}
            title="Restore sample batches and clear anomaly records"
          >
            🔄 Reset Demo Ledger
          </button>
        </div>
      </div>

      {notification && (
        <div className="notification-banner success mb-4">
          {notification}
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">Parent Shipments</span>
          <div className="kpi-value">{totalShipments}</div>
          <span className="kpi-sub">
            {compromisedBatches > 0 ? (
              <span className="danger-text">⚠️ {compromisedBatches} thermally compromised</span>
            ) : (
              'All cold chains intact'
            )}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Total Serialized Packs</span>
          <div className="kpi-value">{totalUnits}</div>
          <span className="kpi-sub">GS1 Digital Link units</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">In Transit</span>
          <div className="kpi-value text-amber">{inTransitCount}</div>
          <span className="kpi-sub">Awaiting pharmacy receipt</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Pharmacy Inventory</span>
          <div className="kpi-value text-blue">{inPharmacyCount}</div>
          <span className="kpi-sub">Ready for dispensing</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Patient Activated</span>
          <div className="kpi-value text-emerald">{activatedCount}</div>
          <span className="kpi-sub">Device bound & safe</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Burned Clones</span>
          <div className="kpi-value text-rose">{burnedCount}</div>
          <span className="kpi-sub">Fraudulent scans detected</span>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="card mt-6">
        <div className="card-header flex justify-between items-center flex-wrap gap-3">
          <h3>Individual Pack Audit Records</h3>

          <div className="table-controls flex gap-2 items-center flex-wrap">
            <input
              type="text"
              placeholder="Search serial, drug, SSCC..."
              className="text-input-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select
              className="select-input-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="RECEIVED_AT_PHARMACY">RECEIVED_AT_PHARMACY</option>
              <option value="ACTIVATED">ACTIVATED</option>
              <option value="BURNED_ANOMALY">BURNED_ANOMALY</option>
            </select>
          </div>
        </div>

        <div className="card-body">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit Serial</th>
                  <th>Medication</th>
                  <th>Batch / SSCC</th>
                  <th>Status</th>
                  <th>Cold Chain</th>
                  <th>Device Binding</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-6">
                      No serialized units match the search filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const parent = shipments.find((s) => s.sscc === item.parent_sscc);
                    return (
                      <tr
                        key={`${item.gtin}-${item.serial}`}
                        className={selectedItem?.serial === item.serial ? 'row-selected' : ''}
                      >
                        <td className="font-mono font-bold">#{item.serial}</td>
                        <td className="font-semibold">{parent?.medicine_name || 'Standard Medication'}</td>
                        <td className="font-mono text-xs">{item.parent_sscc}</td>
                        <td>
                          <span className={`status-badge ${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge-sm ${parent?.is_compromised ? 'breached' : 'safe'}`}>
                            {parent?.is_compromised ? '🚨 BREACHED' : '🟢 SAFE'}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          {item.device_id_hash ? (
                            <span title={item.device_id_hash}>
                              🔒 {item.device_id_hash.substring(0, 10)}...
                            </span>
                          ) : (
                            <span className="text-muted">Unbound</span>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => setSelectedItem(item)}
                            >
                              Inspect
                            </button>
                            {onVerifyItem && (
                              <button
                                type="button"
                                className="btn btn-outline btn-xs"
                                onClick={() => onVerifyItem(item.gtin, item.serial)}
                              >
                                Verify ➔
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Item Inspection Modal / Detail Drawer */}
      {selectedItem && (
        <div className="inspection-modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="inspection-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Unit Provenance Trail: Serial #{selectedItem.serial}</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setSelectedItem(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {(() => {
                const parent = shipments.find((s) => s.sscc === selectedItem.parent_sscc);
                const logs = thermalLogs.filter((l) => l.parent_sscc === selectedItem.parent_sscc);
                return (
                  <div>
                    <div className="provenance-timeline">
                      <div className="timeline-step done">
                        <div className="step-icon">🏭</div>
                        <div className="step-content">
                          <h4>Phase 1: Factory Serialization</h4>
                          <p>
                            Manufactured and serialized under GTIN <code>{selectedItem.gtin}</code>, Batch <code>{parent?.batch_number || selectedItem.parent_sscc}</code>.
                          </p>
                          <span className="step-time">{parent?.created_at ? new Date(parent.created_at).toLocaleString() : 'Registered'}</span>
                        </div>
                      </div>

                      <div className={`timeline-step ${parent?.status === 'RECEIVED_AT_PHARMACY' ? 'done' : 'current'}`}>
                        <div className="step-icon">🚚</div>
                        <div className="step-content">
                          <h4>Phase 2: IoT Cold-Chain Logistics</h4>
                          <p>
                            Packaged in master container <code>{selectedItem.parent_sscc}</code> equipped with ColdGuard BLE sensor.
                          </p>
                          {parent?.is_compromised ? (
                            <span className="status-badge-sm breached mt-1">
                              🚨 Thermal excursion detected during transit
                            </span>
                          ) : (
                            <span className="status-badge-sm safe mt-1">
                              🟢 Cold-chain maintained within 2°C - 8°C
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={`timeline-step ${parent?.status === 'RECEIVED_AT_PHARMACY' ? 'done' : 'pending'}`}>
                        <div className="step-icon">🏥</div>
                        <div className="step-content">
                          <h4>Phase 3: Pharmacy Cold Intake</h4>
                          <p>
                            {parent?.status === 'RECEIVED_AT_PHARMACY'
                              ? 'Batch received and cryptographic handshake completed at pharmacy console.'
                              : 'Pending shipment arrival and BLE sensor verification at receiving pharmacy.'}
                          </p>
                          {logs.length > 0 && (
                            <p className="text-xs text-muted">
                              Latest recorded: Min {logs[0].min_temp}°C / Max {logs[0].max_temp}°C.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className={`timeline-step ${selectedItem.status === 'ACTIVATED' ? 'done' : selectedItem.status === 'BURNED_ANOMALY' ? 'error' : 'pending'}`}>
                        <div className="step-icon">🛡️</div>
                        <div className="step-content">
                          <h4>Phase 4: Consumer Administration & Device Binding</h4>
                          {selectedItem.status === 'ACTIVATED' && (
                            <div>
                              <p className="text-emerald font-semibold">
                                Sealed & Activated by patient device.
                              </p>
                              <code className="text-xs text-muted block font-mono">
                                SHA-256: {selectedItem.device_id_hash}
                              </code>
                            </div>
                          )}
                          {selectedItem.status === 'BURNED_ANOMALY' && (
                            <p className="danger-text font-semibold">
                              🚨 PERMANENTLY BURNED: Unauthorized duplicate scan detected across conflicting device fingerprints.
                            </p>
                          )}
                          {selectedItem.status !== 'ACTIVATED' && selectedItem.status !== 'BURNED_ANOMALY' && (
                            <p className="text-muted">Awaiting consumer scan before administration.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      {onVerifyItem && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            onVerifyItem(selectedItem.gtin, selectedItem.serial);
                            setSelectedItem(null);
                          }}
                        >
                          Verify in Consumer Center ➔
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedItem(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
