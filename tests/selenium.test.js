import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173/';
const SCREENSHOT_DIR = path.resolve('tests/screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

describe('Selenium WebDriver End-to-End Test Suite — MedVerify IoT', () => {
  let driver;

  before(async () => {
    const options = new chrome.Options();
    options.addArguments(
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--window-size=1400,900'
    );

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    await driver.manage().setTimeouts({ implicit: 5000 });
  });

  after(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  // Helper to capture screenshot
  async function takeScreenshot(name) {
    try {
      const data = await driver.takeScreenshot();
      const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
      fs.writeFileSync(filePath, data, 'base64');
      return filePath;
    } catch (e) {
      console.warn('Could not save screenshot:', e.message);
    }
  }

  // TEST CASE 1: Page Load & Branding Check
  it('TC-SEL-01: Verifies initial application load, page title and branding', async () => {
    await driver.get(BASE_URL);

    // Verify Title
    const title = await driver.getTitle();
    assert.match(title, /MedVerify IoT/);

    // Verify Brand Logo and Title
    const brandTitle = await driver.findElement(By.className('nav-brand-title')).getText();
    assert.match(brandTitle, /MedVerify/);

    // Verify Navigation Bar Tabs Exist
    const navTabs = await driver.findElements(By.className('nav-tab-btn'));
    assert.ok(navTabs.length >= 4, 'Must have at least 4 main navigation tabs');

    await takeScreenshot('tc01_initial_load');
  });

  // TEST CASE 2: Tab Navigation Switcher
  it('TC-SEL-02: Tests smooth client-side tab switching across all modules', async () => {
    // Click Pharmacy Intake tab
    const pharmacyTab = await driver.findElement(By.xpath("//button[contains(., 'Pharmacy Intake')]"));
    await pharmacyTab.click();
    const pharmacyHeading = await driver.findElement(By.xpath("//h2[contains(., 'Pharmacy Cold-Chain Intake Console')]"));
    assert.ok(await pharmacyHeading.isDisplayed());

    // Click Consumer Verification tab
    const consumerTab = await driver.findElement(By.xpath("//button[contains(., 'Consumer Verification')]"));
    await consumerTab.click();
    const consumerHeading = await driver.findElement(By.xpath("//h2[contains(., 'Consumer Medicine Verification')]"));
    assert.ok(await consumerHeading.isDisplayed());

    // Click Supply Chain Ledger tab
    const ledgerTab = await driver.findElement(By.xpath("//button[contains(., 'Supply Chain Ledger')]"));
    await ledgerTab.click();
    const ledgerHeading = await driver.findElement(By.xpath("//h2[contains(., 'Supply Chain Audit Ledger')]"));
    assert.ok(await ledgerHeading.isDisplayed());

    // Return to Manufacturer tab
    const mfgTab = await driver.findElement(By.xpath("//button[contains(., 'Manufacturer')]"));
    await mfgTab.click();
    const mfgHeading = await driver.findElement(By.xpath("//h2[contains(., 'Manufacturer Serialization')]"));
    assert.ok(await mfgHeading.isDisplayed());

    await takeScreenshot('tc02_navigation_verified');
  });

  // TEST CASE 3: Manufacturer Serialization Workflow
  it('TC-SEL-03: Generates serialized pharmaceutical batch with GS1 QR codes', async () => {
    await driver.get(BASE_URL);

    // Find and fill Medicine Name input
    const medicineInput = await driver.findElement(By.xpath("//input[@placeholder='e.g. Amoxicillin 500mg Capsules']"));
    await medicineInput.clear();
    await medicineInput.sendKeys('Ciprofloxacin 500mg Tablets');

    // Click Generate Batch button
    const generateBtn = await driver.findElement(By.xpath("//button[contains(., 'Generate Batch & Serialized QR Codes')]"));
    await generateBtn.click();

    // Wait for status confirmation banner
    const statusBanner = await driver.wait(
      until.elementLocated(By.className('status-banner')),
      8000
    );
    const statusText = await statusBanner.getText();
    assert.match(statusText, /Success: Generated/);

    // Verify label preview cards were rendered
    const previewCards = await driver.findElements(By.className('label-preview-card'));
    assert.ok(previewCards.length > 0, 'Must render QR preview cards');

    await takeScreenshot('tc03_batch_serialized');
  });

  // TEST CASE 4: Pharmacy Cold-Chain Safe Intake Flow
  it('TC-SEL-04: Simulates IoT telemetry within safe 2°C - 8°C limits and seals ledger', async () => {
    // Switch to Pharmacy
    const pharmacyTab = await driver.findElement(By.xpath("//button[contains(., 'Pharmacy Intake')]"));
    await pharmacyTab.click();

    // Click Safe preset (2°C - 8°C)
    const safePreset = await driver.findElement(By.xpath("//button[contains(., 'Safe (2°C - 8°C)')]"));
    await safePreset.click();

    // Click Sync IoT Telemetry button
    const syncBtn = await driver.findElement(By.className('sync-btn'));
    await syncBtn.click();

    // Verify success banner appears
    const notification = await driver.wait(
      until.elementLocated(By.xpath("//div[contains(@class, 'notification-banner') and contains(@class, 'success')]")),
      8000
    );
    const bannerText = await notification.getText();
    assert.match(bannerText, /HANDOFF COMPLETE/);

    await takeScreenshot('tc04_pharmacy_safe_intake');
  });

  // TEST CASE 5: Pharmacy Thermal Breach Detection
  it('TC-SEL-05: Detects thermal excursion breach (> 8°C) and flags batch compromised', async () => {
    // Click Heat Breach preset (14.2°C)
    const breachPreset = await driver.findElement(By.xpath("//button[contains(., 'Heat Excursion (14.2°C)')]"));
    await breachPreset.click();

    // Click Sync IoT Telemetry button
    const syncBtn = await driver.findElement(By.className('sync-btn'));
    await syncBtn.click();

    // Verify danger alert banner appears
    const alertBanner = await driver.wait(
      until.elementLocated(By.xpath("//div[contains(@class, 'notification-banner') and contains(@class, 'error')]")),
      8000
    );
    const alertText = await alertBanner.getText();
    assert.match(alertText, /CRITICAL BREACH RECORDED/);

    await takeScreenshot('tc05_pharmacy_heat_breach');
  });

  // TEST CASE 6: Consumer Legitimate Verification & Device Binding
  it('TC-SEL-06: Verifies authentic medicine pack with Phone Device A and binds signature', async () => {
    // Switch to Consumer tab
    const consumerTab = await driver.findElement(By.xpath("//button[contains(., 'Consumer Verification')]"));
    await consumerTab.click();

    // Ensure 1-Click Demo Pick tab is active
    const demoTabBtn = await driver.findElement(By.xpath("//button[contains(., '1-Click Demo Pick')]"));
    await demoTabBtn.click();

    // Explicitly wait for demo items to render and click the first Verify Pack button
    const firstVerifyBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Verify Pack 🔍')]")),
      8000
    );
    await firstVerifyBtn.click();

    // Wait for certificate verdict banner
    const verdictBanner = await driver.wait(
      until.elementLocated(By.className('verdict-title')),
      8000
    );
    const verdictTitle = await verdictBanner.getText();
    assert.match(verdictTitle, /Authentic/);

    await takeScreenshot('tc06_consumer_authentic_verified');
  });

  // TEST CASE 7: Anti-Counterfeiting Clone Attack Detection
  it('TC-SEL-07: Simulates counterfeit clone attack on Device B and triggers high-threat alert', async () => {
    // Switch Simulated Phone Device to Device B (Cloner phone)
    const deviceSelect = await driver.findElement(By.className('select-input-sm'));
    await deviceSelect.click();
    const deviceBOption = await driver.findElement(By.xpath("//option[contains(., 'Device B (Counterfeiter')]"));
    await deviceBOption.click();

    // Click Verify Pack again on that same pack
    const verifyBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Verify Pack 🔍')]")),
      8000
    );
    await verifyBtn.click();

    // Assert that the verdict indicates a Clone Detection or Security Alert
    const verdictBanner = await driver.wait(
      until.elementLocated(By.className('verdict-title')),
      8000
    );
    const verdictText = await verdictBanner.getText();
    assert.ok(
      verdictText.includes('Clone') || verdictText.includes('Breach') || verdictText.includes('Alert'),
      `Expected security alarm, got: ${verdictText}`
    );

    await takeScreenshot('tc07_clone_detection_alert');
  });

  // TEST CASE 8: Supply Chain Ledger & Provenance Modal
  it('TC-SEL-08: Inspects unit provenance lifecycle modal in Supply Chain Ledger', async () => {
    // Switch to Ledger
    const ledgerTab = await driver.findElement(By.xpath("//button[contains(., 'Supply Chain Ledger')]"));
    await ledgerTab.click();

    // Verify KPI Cards are present
    const kpiCards = await driver.findElements(By.className('kpi-card'));
    assert.equal(kpiCards.length, 6, 'Must show all 6 supply chain KPI metrics');

    // Wait for data table rows to render and click Inspect
    const inspectBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Inspect')]")),
      8000
    );
    await inspectBtn.click();

    // Wait for Provenance Modal to appear
    const modal = await driver.wait(
      until.elementLocated(By.className('inspection-modal')),
      5000
    );
    assert.ok(await modal.isDisplayed());

    // Verify 4-phase timeline steps exist
    const timelineSteps = await driver.findElements(By.className('timeline-step'));
    assert.equal(timelineSteps.length, 4, 'Must show 4 lifecycle phases');

    await takeScreenshot('tc08_provenance_modal');

    // Close Modal
    const closeBtn = await driver.findElement(By.className('close-btn'));
    await closeBtn.click();
  });
});
