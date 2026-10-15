import { supabase } from '../supabaseClient.js';

const STORAGE_KEY = 'medverify_pharma_data_v2';
const DEMO_MODE_KEY = 'medverify_demo_mode';

// SHA-256 device hashing for single-use activation / clone detection
export async function hashDeviceId(rawId) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${rawId}_MedVerify_SecureSalt_2026`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback simple hash if crypto.subtle is restricted
    let hash = 0;
    const str = `${rawId}_MedVerify_SecureSalt_2026`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }
}

// Initial realistic pharma seed dataset
export function getInitialSeedData() {
  const shipments = [
    {
      sscc: 'SSCC-948201',
      batch_number: 'BATCH-948201',
      medicine_name: 'Paracetamol 500mg Oral Tablets',
      expiry_date: '2027-12-31',
      status: 'IN_TRANSIT',
      is_compromised: false,
      total_units: 8,
      created_at: new Date(Date.now() - 3600000 * 48).toISOString()
    },
    {
      sscc: 'SSCC-774102',
      batch_number: 'BATCH-774102',
      medicine_name: 'Insulin Glargine 100 U/mL Pens',
      expiry_date: '2026-11-30',
      status: 'RECEIVED_AT_PHARMACY',
      is_compromised: false,
      total_units: 8,
      created_at: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      sscc: 'SSCC-331908',
      batch_number: 'BATCH-331908',
      medicine_name: 'mRNA Vaccine BNT162b2 Vials',
      expiry_date: '2026-08-15',
      status: 'RECEIVED_AT_PHARMACY',
      is_compromised: true,
      total_units: 8,
      created_at: new Date(Date.now() - 3600000 * 12).toISOString()
    }
  ];

  const thermalLogs = [
    {
      id: 'log-1',
      parent_sscc: 'SSCC-774102',
      min_temp: 3.4,
      max_temp: 5.6,
      out_of_bounds_duration: 0,
      battery_level: 96,
      created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
      notes: 'Cold chain verified strictly within 2°C - 8°C window.'
    },
    {
      id: 'log-2',
      parent_sscc: 'SSCC-331908',
      min_temp: 4.1,
      max_temp: 14.8,
      out_of_bounds_duration: 165,
      battery_level: 88,
      created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
      notes: 'CRITICAL ALERT: Ambient thermal excursion detected during transit.'
    }
  ];

  const childItems = [];
  const gtinBase = '00312345678906';

  // Generate child items for Batch 1 (In Transit)
  for (let i = 1; i <= 8; i++) {
    childItems.push({
      gtin: gtinBase,
      serial: String(i).padStart(6, '0'),
      parent_sscc: 'SSCC-948201',
      status: 'IN_TRANSIT',
      device_id_hash: null,
      first_scanned_at: null
    });
  }

  // Generate child items for Batch 2 (Safe at Pharmacy)
  for (let i = 1; i <= 8; i++) {
    const isFirstActive = i === 1;
    childItems.push({
      gtin: gtinBase,
      serial: String(100 + i).padStart(6, '0'),
      parent_sscc: 'SSCC-774102',
      status: isFirstActive ? 'ACTIVATED' : 'RECEIVED_AT_PHARMACY',
      device_id_hash: isFirstActive ? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' : null,
      first_scanned_at: isFirstActive ? new Date(Date.now() - 3600000 * 2).toISOString() : null
    });
  }

  // Generate child items for Batch 3 (Compromised at Pharmacy)
  for (let i = 1; i <= 8; i++) {
    childItems.push({
      gtin: gtinBase,
      serial: String(200 + i).padStart(6, '0'),
      parent_sscc: 'SSCC-331908',
      status: 'RECEIVED_AT_PHARMACY',
      device_id_hash: null,
      first_scanned_at: null
    });
  }

  return { shipments, childItems, thermalLogs };
}

// Local storage helpers
function readLocalStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialSeedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read from local store, re-seeding', err);
    const initial = getInitialSeedData();
    return initial;
  }
}

function writeLocalStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to write to local store', err);
  }
}

async function safeSupabaseSync(actionFn) {
  if (DataService.isDemoMode()) return;
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300));
    await Promise.race([actionFn(), timeout]);
  } catch {}
}

// Core unified data service with automatic Supabase + LocalStorage fallback
export const DataService = {
  isDemoMode() {
    const saved = localStorage.getItem(DEMO_MODE_KEY);
    return saved === null ? true : saved === 'true';
  },

  setDemoMode(enabled) {
    localStorage.setItem(DEMO_MODE_KEY, String(enabled));
  },

  resetToInitial() {
    const initial = getInitialSeedData();
    writeLocalStore(initial);
    return initial;
  },

  async getShipments() {
    if (!this.isDemoMode()) {
      try {
        const fetchPromise = supabase
          .from('parent_shipments')
          .select('*')
          .order('created_at', { ascending: false });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300));
        const { data, error } = await Promise.race([fetchPromise, timeout]);
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch {}
    }
    const store = readLocalStore();
    return store.shipments;
  },

  async upsertShipment(shipment) {
    const store = readLocalStore();
    const existingIndex = store.shipments.findIndex((s) => s.sscc === shipment.sscc);
    const updated = {
      ...shipment,
      created_at: shipment.created_at || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      store.shipments[existingIndex] = { ...store.shipments[existingIndex], ...updated };
    } else {
      store.shipments.unshift(updated);
    }
    writeLocalStore(store);

    // Fast best-effort Supabase sync
    await safeSupabaseSync(() =>
      supabase.from('parent_shipments').upsert([updated], { onConflict: 'sscc' })
    );

    return updated;
  },

  async getChildItems(parentSscc = null) {
    if (!this.isDemoMode()) {
      try {
        let query = supabase.from('child_items').select('*');
        if (parentSscc) {
          query = query.eq('parent_sscc', parentSscc);
        }
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300));
        const { data, error } = await Promise.race([query, timeout]);
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch {}
    }

    const store = readLocalStore();
    if (parentSscc) {
      return store.childItems.filter((item) => item.parent_sscc === parentSscc);
    }
    return store.childItems;
  },

  async upsertChildItems(items) {
    const store = readLocalStore();
    for (const item of items) {
      const idx = store.childItems.findIndex(
        (c) => c.gtin === item.gtin && c.serial === item.serial
      );
      if (idx >= 0) {
        store.childItems[idx] = { ...store.childItems[idx], ...item };
      } else {
        store.childItems.push(item);
      }
    }
    writeLocalStore(store);

    safeSupabaseSync(() =>
      supabase.from('child_items').upsert(items, { onConflict: ['gtin', 'serial'] })
    );

    return items;
  },

  async recordThermalHandoff({ parentSscc, minTemp, maxTemp, outOfBoundsDuration = 0, notes = '' }) {
    const isCompromised = minTemp < 2.0 || maxTemp > 8.0;
    const store = readLocalStore();

    // 1. Add log
    const logEntry = {
      id: `log-${Date.now()}`,
      parent_sscc: parentSscc,
      min_temp: Number(minTemp),
      max_temp: Number(maxTemp),
      out_of_bounds_duration: Number(outOfBoundsDuration),
      created_at: new Date().toISOString(),
      notes: notes || (isCompromised ? 'Thermal breach recorded.' : 'Normal cold-chain verified.')
    };
    store.thermalLogs.unshift(logEntry);

    // 2. Update parent shipment
    const pIdx = store.shipments.findIndex((s) => s.sscc === parentSscc);
    if (pIdx >= 0) {
      store.shipments[pIdx].status = 'RECEIVED_AT_PHARMACY';
      store.shipments[pIdx].is_compromised = isCompromised;
    }

    // 3. Update all child items of this parent
    store.childItems.forEach((c) => {
      if (c.parent_sscc === parentSscc && c.status === 'IN_TRANSIT') {
        c.status = 'RECEIVED_AT_PHARMACY';
      }
    });

    writeLocalStore(store);

    // Fast best-effort Supabase sync
    safeSupabaseSync(async () => {
      await supabase.from('thermal_logs').insert([logEntry]);
      await supabase
        .from('parent_shipments')
        .update({ status: 'RECEIVED_AT_PHARMACY', is_compromised: isCompromised })
        .eq('sscc', parentSscc);
      await supabase
        .from('child_items')
        .update({ status: 'RECEIVED_AT_PHARMACY' })
        .eq('parent_sscc', parentSscc);
    });

    return { logEntry, isCompromised };
  },

  async getThermalLogs(parentSscc = null) {
    if (!this.isDemoMode()) {
      try {
        let query = supabase.from('thermal_logs').select('*').order('created_at', { ascending: false });
        if (parentSscc) {
          query = query.eq('parent_sscc', parentSscc);
        }
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300));
        const { data, error } = await Promise.race([query, timeout]);
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch {}
    }

    const store = readLocalStore();
    if (parentSscc) {
      return store.thermalLogs.filter((l) => l.parent_sscc === parentSscc);
    }
    return store.thermalLogs;
  },

  async verifyItem({ gtin, serial, deviceId }) {
    const hashedDeviceToken = await hashDeviceId(deviceId);
    const store = readLocalStore();

    const item = store.childItems.find((c) => c.gtin === gtin && c.serial === serial);
    if (!item) {
      return {
        verdict: 'COUNTERFEIT',
        color: '#EF4444',
        title: '🔴 Counterfeit Alert: Unregistered Serial Number',
        message: 'This Serial and GTIN combination does not exist in the authorized supply chain ledger. Do not administer.',
        item: null,
        parent: null
      };
    }

    const parent = store.shipments.find((s) => s.sscc === item.parent_sscc);

    // Check if thermally compromised
    if (parent?.is_compromised) {
      return {
        verdict: 'THERMAL_BREACH',
        color: '#DC2626',
        title: '🔴 Thermal Integrity Breach Alert',
        message: `Batch ${parent.batch_number} violated cold-chain requirements (2°C - 8°C). The molecular efficacy may be compromised. Do not use.`,
        item,
        parent
      };
    }

    // Check if already burned as anomaly
    if (item.status === 'BURNED_ANOMALY') {
      return {
        verdict: 'BURNED_CLONE',
        color: '#991B1B',
        title: '🔴 Critical Security Alert: Counterfeit Clone Detected',
        message: 'This pack serial was previously scanned and permanently invalidated due to unauthorized duplicate scans.',
        item,
        parent
      };
    }

    // Check if item is in transit
    if (item.status === 'IN_TRANSIT') {
      return {
        verdict: 'IN_TRANSIT',
        color: '#F59E0B',
        title: '🟡 Warning: Unreleased Batch (In Transit)',
        message: 'This unit has not completed pharmacy cold-chain intake yet. Official dispensing handoff is pending.',
        item,
        parent
      };
    }

    // Item is at pharmacy or activated
    if (item.status === 'RECEIVED_AT_PHARMACY' || item.status === 'ACTIVATED') {
      // First scan: Bind to this device
      if (!item.device_id_hash) {
        item.status = 'ACTIVATED';
        item.device_id_hash = hashedDeviceToken;
        item.first_scanned_at = new Date().toISOString();
        writeLocalStore(store);

        // Fast best-effort Supabase sync
        safeSupabaseSync(() =>
          supabase
            .from('child_items')
            .update({ status: 'ACTIVATED', device_id_hash: hashedDeviceToken })
            .match({ gtin, serial })
        );

        return {
          verdict: 'AUTHENTIC_FIRST_SCAN',
          color: '#10B981',
          title: '🟢 Authentic & Safe to Administer',
          message: 'Product identity confirmed. Cold chain verified. Successfully sealed and bound to your device signature.',
          item,
          parent,
          deviceHash: hashedDeviceToken
        };
      }

      // Re-scan by the same owner device
      if (item.device_id_hash === hashedDeviceToken) {
        return {
          verdict: 'AUTHENTIC_OWNER',
          color: '#059669',
          title: '🟢 Authentic: Previously Activated by You',
          message: `Verified legitimate pack bound to your device signature at ${new Date(item.first_scanned_at).toLocaleString()}.`,
          item,
          parent,
          deviceHash: hashedDeviceToken
        };
      }

      // Scan by an UNKNOWN second device: CLONE DETECTED!
      item.status = 'BURNED_ANOMALY';
      writeLocalStore(store);

      safeSupabaseSync(() =>
        supabase
          .from('child_items')
          .update({ status: 'BURNED_ANOMALY' })
          .match({ gtin, serial })
      );

      return {
        verdict: 'CLONE_DETECTED',
        color: '#B91C1C',
        title: '🔴 High Threat: Physical Label Clone Detected',
        message: 'This serial was already registered to another phone device. A duplicate or counterfeit duplicate label has been detected and permanently BURNED.',
        item,
        parent,
        deviceHash: hashedDeviceToken
      };
    }

    return {
      verdict: 'UNKNOWN',
      color: '#64748B',
      title: '⚪ Status Indeterminate',
      message: 'Unknown ledger condition.',
      item,
      parent
    };
  }
};
