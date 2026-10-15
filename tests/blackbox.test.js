import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up in-memory localStorage mock for test environment
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

import { DataService } from '../src/services/dataService.js';

describe('Black Box Testing — Functional Specifications, Requirements & User Journeys', () => {

  beforeEach(() => {
    global.localStorage.clear();
    DataService.resetToInitial();
  });

  // SPECIFICATION 1: Manufacturer Serialization & Packaging Contract
  describe('REQ-001: Manufacturer Batch Generation & GS1 Compliance', () => {
    it('creates a parent batch shipment with matching unit counts and correct status', async () => {
      // User inputs through Manufacturer form:
      const inputBatch = {
        sscc: 'SSCC-TEST-888',
        batch_number: 'BATCH-TEST-888',
        medicine_name: 'Azithromycin 250mg',
        expiry_date: '2028-05-15',
        status: 'IN_TRANSIT',
        is_compromised: false,
        total_units: 5
      };

      const created = await DataService.upsertShipment(inputBatch);
      assert.equal(created.sscc, 'SSCC-TEST-888');
      assert.equal(created.status, 'IN_TRANSIT');
      assert.equal(created.is_compromised, false);

      // Verify the batch appears in the system ledger
      const allShipments = await DataService.getShipments();
      const found = allShipments.find(s => s.sscc === 'SSCC-TEST-888');
      assert.ok(found, 'Created shipment must exist in system query');
      assert.equal(found.medicine_name, 'Azithromycin 250mg');
    });

    it('creates child item serials conforming to standard GS1 packaging structure', async () => {
      const gtin = '00312345678906';
      const batchSscc = 'SSCC-TEST-888';
      const unitSerials = ['000001', '000002', '000003'];

      const childPayload = unitSerials.map(s => ({
        gtin,
        serial: s,
        parent_sscc: batchSscc,
        status: 'IN_TRANSIT',
        device_id_hash: null
      }));

      await DataService.upsertChildItems(childPayload);

      const items = await DataService.getChildItems(batchSscc);
      assert.equal(items.length, 3, 'Must contain exactly 3 serialized packs');

      for (const item of items) {
        assert.equal(item.gtin, gtin);
        assert.equal(item.parent_sscc, batchSscc);
        assert.equal(item.status, 'IN_TRANSIT');
        assert.equal(item.device_id_hash, null, 'New pack must initially be unbound');
      }
    });
  });

  // SPECIFICATION 2: Pharmacy Cold-Chain Telemetry Ingestion Contract
  describe('REQ-002: Pharmacy IoT Environmental Ingestion & Tamper-Sealing', () => {
    it('successfully confirms and marks shipment as safe when telemetry is within 2°C - 8°C', async () => {
      const handoffResult = await DataService.recordThermalHandoff({
        parentSscc: 'SSCC-948201',
        minTemp: 3.5,
        maxTemp: 6.2,
        outOfBoundsDuration: 0,
        notes: 'Routine pharmacy intake. Cold chain valid.'
      });

      // Assert external response contract
      assert.equal(handoffResult.isCompromised, false);
      assert.equal(handoffResult.logEntry.min_temp, 3.5);
      assert.equal(handoffResult.logEntry.max_temp, 6.2);

      // Verify external state change on shipment
      const shipments = await DataService.getShipments();
      const target = shipments.find(s => s.sscc === 'SSCC-948201');
      assert.equal(target.status, 'RECEIVED_AT_PHARMACY');
      assert.equal(target.is_compromised, false);
    });

    it('flags batch as COMPROMISED when temperature exceeds safe threshold', async () => {
      const handoffResult = await DataService.recordThermalHandoff({
        parentSscc: 'SSCC-948201',
        minTemp: 4.0,
        maxTemp: 13.8,
        outOfBoundsDuration: 145,
        notes: 'High temperature excursion during transit.'
      });

      assert.equal(handoffResult.isCompromised, true);

      const shipments = await DataService.getShipments();
      const target = shipments.find(s => s.sscc === 'SSCC-948201');
      assert.equal(target.is_compromised, true);
    });
  });

  // SPECIFICATION 3: Consumer Verification & Anti-Counterfeiting User Experience
  describe('REQ-003: Patient / Consumer Verification Lifecycle', () => {
    it('USER SCENARIO A: Legitimate buyer verifies safe medication on their personal phone', async () => {
      // Input: Patient scans medicine pack #000102 on Phone A
      const response = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000102',
        deviceId: 'patient-personal-iphone'
      });

      // Output contract assertions
      assert.equal(response.verdict, 'AUTHENTIC_FIRST_SCAN');
      assert.equal(response.color, '#10B981'); // Emerald green
      assert.match(response.title, /Authentic & Safe/);
      assert.ok(response.deviceHash, 'Must provide cryptographic device hash');
    });

    it('USER SCENARIO B: Patient re-scans their previously authenticated pack (same device)', async () => {
      // First scan
      await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000102',
        deviceId: 'patient-personal-iphone'
      });

      // Follow-up scan by the patient
      const reScanResponse = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000102',
        deviceId: 'patient-personal-iphone'
      });

      assert.equal(reScanResponse.verdict, 'AUTHENTIC_OWNER');
      assert.match(reScanResponse.title, /Previously Activated by You/);
    });

    it('USER SCENARIO C: Counterfeiter clones QR code and scans on a second phone -> CLONE DETECTED', async () => {
      // Legitimate purchase and activation
      await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000102',
        deviceId: 'patient-personal-iphone'
      });

      // Malicious or duplicate attempt on a different device
      const duplicateScanResponse = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000102',
        deviceId: 'cloner-suspicious-phone'
      });

      assert.equal(duplicateScanResponse.verdict, 'CLONE_DETECTED');
      assert.equal(duplicateScanResponse.color, '#B91C1C'); // Red alert
      assert.match(duplicateScanResponse.title, /Physical Label Clone Detected/);
    });

    it('USER SCENARIO D: Consumer attempts to verify a medicine from a temperature-breached batch', async () => {
      // Pack #000201 belongs to batch SSCC-331908 which suffered 14.8°C thermal excursion
      const breachResponse = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000201',
        deviceId: 'patient-phone'
      });

      assert.equal(breachResponse.verdict, 'THERMAL_BREACH');
      assert.match(breachResponse.title, /Thermal Integrity Breach Alert/);
    });

    it('USER SCENARIO E: Consumer scans an unregistered or fabricated fake barcode', async () => {
      const counterfeitResponse = await DataService.verifyItem({
        gtin: '00000000000000',
        serial: 'FAKE999',
        deviceId: 'patient-phone'
      });

      assert.equal(counterfeitResponse.verdict, 'COUNTERFEIT');
      assert.match(counterfeitResponse.title, /Unregistered Serial Number/);
    });
  });
});
