import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up in-memory localStorage mock for node environment
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

import { DataService, hashDeviceId, getInitialSeedData } from '../src/services/dataService.js';
import { renderTemplate } from '../src/utils/labelTemplate.js';

describe('White Box Testing — Internal Logic, Code Paths & Structural Integrity', () => {

  beforeEach(() => {
    global.localStorage.clear();
    DataService.resetToInitial();
  });

  // 1. Cryptographic Function Logic (Algorithm & Branch Analysis)
  describe('Cryptographic Hash Function: hashDeviceId()', () => {
    it('generates a valid 64-character SHA-256 hex digest', async () => {
      const hash = await hashDeviceId('test-device-001');
      assert.equal(typeof hash, 'string');
      assert.equal(hash.length, 64, 'SHA-256 output must be exactly 64 hex characters');
      assert.match(hash, /^[0-9a-f]{64}$/, 'Hash must contain only lowercase hex characters');
    });

    it('is strictly deterministic: identical inputs yield identical outputs', async () => {
      const hash1 = await hashDeviceId('phone-patient-alpha');
      const hash2 = await hashDeviceId('phone-patient-alpha');
      assert.equal(hash1, hash2, 'Identical device IDs must produce identical hashes');
    });

    it('is collision-resistant: different inputs produce completely different hashes (Avalanche Effect)', async () => {
      const hashA = await hashDeviceId('phone-patient-alpha');
      const hashB = await hashDeviceId('phone-patient-beta');
      assert.notEqual(hashA, hashB, 'Different device IDs must not collide');
    });
  });

  // 2. Boundary Value Analysis: Cold-Chain Threshold Logic
  describe('Boundary Value Analysis: recordThermalHandoff() Temperature Limits', () => {
    it('accepts safe lower boundary: exactly 2.0°C is within cold-chain limits', async () => {
      const res = await DataService.recordThermalHandoff({
        parentSscc: 'SSCC-948201',
        minTemp: 2.0,
        maxTemp: 5.0,
        outOfBoundsDuration: 0
      });
      assert.equal(res.isCompromised, false, '2.0°C is the inclusive lower boundary and must be safe');
    });

    it('rejects below lower boundary: 1.9°C triggers cold-chain breach', async () => {
      const res = await DataService.recordThermalHandoff({
        parentSscc: 'SSCC-948201',
        minTemp: 1.9,
        maxTemp: 5.0,
        outOfBoundsDuration: 15
      });
      assert.equal(res.isCompromised, true, '1.9°C is below 2.0°C and must trigger compromise');
    });

    it('accepts safe upper boundary: exactly 8.0°C is within cold-chain limits', async () => {
      const res = await DataService.recordThermalHandoff({
        parentSscc: 'SSCC-948201',
        minTemp: 4.0,
        maxTemp: 8.0,
        outOfBoundsDuration: 0
      });
      assert.equal(res.isCompromised, false, '8.0°C is the inclusive upper boundary and must be safe');
    });

    it('rejects above upper boundary: 8.1°C triggers thermal breach', async () => {
      const res = await DataService.recordThermalHandoff({
        parentSscc: 'SSCC-948201',
        minTemp: 4.0,
        maxTemp: 8.1,
        outOfBoundsDuration: 30
      });
      assert.equal(res.isCompromised, true, '8.1°C exceeds 8.0°C and must trigger compromise');
    });
  });

  // 3. Control Flow & State Transition Testing (All Decision Branches in verifyItem)
  describe('verifyItem() Branch & State Machine Coverage', () => {
    it('Branch 1: Item does not exist -> returns COUNTERFEIT verdict', async () => {
      const outcome = await DataService.verifyItem({
        gtin: '99999999999999',
        serial: '999999',
        deviceId: 'device-test'
      });
      assert.equal(outcome.verdict, 'COUNTERFEIT');
      assert.equal(outcome.item, null);
    });

    it('Branch 2: Parent shipment is marked compromised -> returns THERMAL_BREACH', async () => {
      // SSCC-331908 is pre-seeded as compromised
      const outcome = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000201',
        deviceId: 'device-test'
      });
      assert.equal(outcome.verdict, 'THERMAL_BREACH');
      assert.equal(outcome.parent.is_compromised, true);
    });

    it('Branch 3: Item is in transit -> returns IN_TRANSIT warning', async () => {
      // SSCC-948201 items are IN_TRANSIT
      const outcome = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000001',
        deviceId: 'device-test'
      });
      assert.equal(outcome.verdict, 'IN_TRANSIT');
    });

    it('Branch 4: First scan of received item -> binds device hash and transitions to ACTIVATED', async () => {
      // 000102 is RECEIVED_AT_PHARMACY with no device hash
      const outcome = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000102',
        deviceId: 'device-primary-buyer'
      });
      assert.equal(outcome.verdict, 'AUTHENTIC_FIRST_SCAN');
      assert.equal(outcome.item.status, 'ACTIVATED');
      assert.ok(outcome.item.device_id_hash, 'Device hash must be stored');
    });

    it('Branch 5: Re-scan by same registered device -> returns AUTHENTIC_OWNER', async () => {
      // First scan binds
      await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000103',
        deviceId: 'device-primary-buyer'
      });

      // Second scan on same device
      const rescan = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000103',
        deviceId: 'device-primary-buyer'
      });
      assert.equal(rescan.verdict, 'AUTHENTIC_OWNER');
    });

    it('Branch 6: Scan by conflicting second device -> detects clone and burns serial to BURNED_ANOMALY', async () => {
      // Step 1: Legitimate patient binds device A
      await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000104',
        deviceId: 'device-A'
      });

      // Step 2: Cloner scans duplicate physical label with device B
      const cloneScan = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000104',
        deviceId: 'device-B'
      });
      assert.equal(cloneScan.verdict, 'CLONE_DETECTED');

      // Step 3: Verify the internal status was permanently burned
      const items = await DataService.getChildItems();
      const burnedItem = items.find(i => i.serial === '000104');
      assert.equal(burnedItem.status, 'BURNED_ANOMALY', 'Unit must be permanently burned in ledger');
    });

    it('Branch 7: Scanning an already burned item -> returns BURNED_CLONE verdict', async () => {
      // Burn item first
      await DataService.verifyItem({ gtin: '00312345678906', serial: '000105', deviceId: 'device-A' });
      await DataService.verifyItem({ gtin: '00312345678906', serial: '000105', deviceId: 'device-B' });

      // Third attempt from any device
      const res = await DataService.verifyItem({
        gtin: '00312345678906',
        serial: '000105',
        deviceId: 'device-C'
      });
      assert.equal(res.verdict, 'BURNED_CLONE');
    });
  });

  // 4. Utility Logic & Parser Testing
  describe('String Parsing & Template Renderer: renderTemplate()', () => {
    it('interpolates placeholders with corresponding context keys', () => {
      const template = 'Drug: {{medicine_name}} | Lot: {{batch_number}}';
      const result = renderTemplate(template, {
        medicine_name: 'Amoxicillin',
        batch_number: 'BATCH-4491'
      });
      assert.equal(result, 'Drug: Amoxicillin | Lot: BATCH-4491');
    });

    it('handles empty context or missing placeholders gracefully without errors', () => {
      const template = 'Batch: {{batch_number}} | Note: {{missing_field}}';
      const result = renderTemplate(template, { batch_number: 'B1' });
      assert.equal(result, 'Batch: B1 | Note: ');
    });
  });
});
