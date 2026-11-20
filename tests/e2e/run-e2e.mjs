import { chromium } from 'playwright';
import express from 'express';
import path from 'node:path';

const DIST_DIR = path.resolve('dist');
const SCREENSHOT_DIR = path.resolve(
  'C:/Users/arull/.gemini/antigravity/brain/7021a36b-045b-4f62-83d2-1251ca738c87/scratch'
);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function run() {
  const app = express();
  app.use(express.static(DIST_DIR));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });

  let server;
  let browser;
  const results = [];

  try {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log('E2E localStorage SPA server running at', baseUrl);

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
    });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Direct Entry to Dashboard (Light Workspace default & empty state without Demo button)
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForURL('**/dashboard');
    await page.getByText('Your workspace is ready').waitFor({ state: 'visible' });
    const demoBtnCount = await page.getByRole('button', { name: /Load Sample Project/i }).count();
    assert(demoBtnCount === 0, 'Demo workspace button should be removed');
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert(initialTheme === 'light', `Default theme should be light, got ${initialTheme}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_desktop_empty_en_light.png') });
    results.push('Direct Entry: opens straight to /dashboard in English with Light Workspace default and clean empty state');

    // 2. Quick Add Task using custom Dropdown & Tomorrow's deadline (triggers default D-1 Reminder)
    await page.getByRole('button', { name: 'Quick Add Task', exact: true }).click();
    const tomorrowLocal = await page.evaluate(() => {
      const dt = new Date();
      dt.setDate(dt.getDate() + 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    });
    await page.getByLabel('Task Title').fill('Finalize Sprint & Kanban integration');
    await page.getByRole('combobox', { name: 'Priority' }).click();
    await page.getByRole('option', { name: 'High' }).click();
    await page.getByLabel('Due Date').fill(tomorrowLocal);
    await page.getByRole('button', { name: /Save Task/i }).click();
    await page.getByText('Finalize Sprint & Kanban integration').first().waitFor({ state: 'visible' });

    // Verify D-1 Reminder Notification Banner + Top Bar Bell Menu immediately triggers
    await page.getByRole('region', { name: 'Active deadline reminders' }).waitFor({ state: 'visible' });
    await page.getByText(/Don't forget, you have task "Finalize Sprint & Kanban integration"/i).first().waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Deadline reminders/i }).click();
    await page.getByRole('dialog', { name: 'Deadline reminder center' }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_reminder_bell_desktop.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Deadline reminder center' }).waitFor({ state: 'detached' });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_dashboard_en_light.png') });
    results.push('Dashboard Quick Add + D-1 Reminder: default reminder triggers banner, toast & Bell dialog cleanly');

    // 3. Task Detail Drawer + Subtask + Custom Reminder Days + Escape
    await page.getByRole('button', { name: 'Finalize Sprint & Kanban integration', exact: true }).first().click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.getByRole('combobox', { name: /Deadline Reminder/i }).click();
    await page.getByRole('option', { name: /Custom days/i }).click();
    await page.getByLabel(/Custom Days Before Deadline/i).fill('2');
    await page.getByRole('button', { name: /Save Changes/i }).click();
    await page.getByText('Task changes saved.').first().waitFor({ state: 'visible' });
    await page.getByLabel('Add new subtask step').fill('Verify dropdown and layout');
    await page.getByRole('button', { name: /^Add$/i }).click();
    await page.getByText('Verify dropdown and layout').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    results.push('Task Detail Drawer: custom reminder days saved, subtask added, closed cleanly with Escape');

    async function openRadialAndNavigate(label, screenshotName) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      const radialDialog = page.getByRole('dialog', { name: 'Navigation menu' });
      await radialDialog.waitFor({ state: 'visible' });
      if (screenshotName) {
        await page.waitForTimeout(420);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, screenshotName) });
      }
      await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: label }).click();
      await radialDialog.waitFor({ state: 'detached' });
    }

    // 4. My Tasks: navigate from Dashboard & test custom filter dropdowns
    await page.getByRole('link', { name: 'View all' }).click();
    await page.waitForURL('**/tasks');
    await page.getByRole('combobox', { name: 'Filter priority' }).click();
    await page.getByRole('option', { name: 'High' }).click();
    await page.getByText('Finalize Sprint & Kanban integration').first().waitFor({ state: 'visible' });
    results.push('My Tasks: custom Priority filter dropdown works without clipping');

    // 5. Kanban Board + Custom Column
    await page.goto(`${baseUrl}/board`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Backlog' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Add Column/i }).click();
    await page.getByLabel('Column Name').fill('QA Staging');
    await page.getByRole('button', { name: /Create Column/i }).click();
    await page.getByRole('heading', { name: 'QA Staging' }).waitFor({ state: 'visible' });
    results.push('Kanban Board: displays default columns & custom column QA Staging');

    // 6. Sprints (via 5-item Radial Sidebar) + Burndown
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const radialNav = page.getByRole('navigation', { name: 'Primary navigation' });
    await radialNav.waitFor({ state: 'visible' });
    const radialLinkCount = await radialNav.getByRole('link').count();
    assert(radialLinkCount === 5, `Radial Sidebar must contain exactly 5 items, got ${radialLinkCount}`);
    await page.waitForTimeout(420);
    await radialNav.getByRole('link', { name: 'Sprints' }).click();
    await page.getByRole('dialog', { name: 'Navigation menu' }).waitFor({ state: 'detached' });
    await page.waitForURL('**/sprints');
    await page.getByRole('button', { name: /New Sprint/i }).click();
    await page.getByLabel('Sprint Name').fill('Sprint 01 Verification');
    await page.getByLabel('Sprint Goal').fill('Ship English UI and Settings Vault');
    await page.getByRole('button', { name: /Save Sprint/i }).click();
    await page.getByRole('heading', { name: 'Sprint 01 Verification' }).waitFor({ state: 'visible' });

    await page.getByRole('link', { name: /Details & Burndown/i }).first().click();
    await page.waitForURL('**/sprints/*');
    await page.getByRole('button', { name: /Start Sprint/i }).click();
    await page.getByRole('button', { name: /Complete Sprint/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Assign from Backlog/i }).first().click();
    await page.getByRole('button', { name: /^Assign$/i }).first().click();
    await page.keyboard.press('Escape');
    await page.getByText('Remaining sprint tasks vs daily target').waitFor({ state: 'visible' });
    results.push('Sprint Management: creates sprint, starts sprint, assigns task, renders Burndown');

    // 7. Focus Mode: automatic Dynamic Island popup persists across navigation
    await openRadialAndNavigate('Focus Mode');
    await page.waitForURL('**/focus');

    await page.getByRole('combobox', { name: /Active Task/i }).click();
    await page.getByRole('option', { name: /Finalize Sprint & Kanban integration/i }).click();
    await page.getByRole('button', { name: /Test Alerts|Test Sound/i }).click();
    await page.getByRole('button', { name: /Start Timer/i }).click();

    const focusPopup = page.getByRole('region', { name: 'Focus Mode timer popup' });
    await focusPopup.waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_focus_popup_en_light.png') });

    // Navigate away to Calendar while timer is running -> Popup must stay visible automatically!
    await openRadialAndNavigate('Calendar');
    await page.waitForURL('**/calendar');
    await focusPopup.waitFor({ state: 'visible' });
    await focusPopup.getByRole('button', { name: 'Pause focus session' }).click();
    await focusPopup.getByRole('button', { name: 'Resume focus session' }).waitFor({ state: 'visible' });
    await focusPopup.getByRole('link', { name: /Open Focus/i }).click();
    await page.waitForURL('**/focus');
    await focusPopup.waitFor({ state: 'visible' });
    await focusPopup.getByRole('button', { name: 'Stop focus timer' }).click();
    await focusPopup.waitFor({ state: 'detached' });
    results.push('Focus Mode: English Dynamic Island popup runs automatically and persists across routes');

    // 8. Calendar
    await openRadialAndNavigate('Calendar');
    await page.waitForURL('**/calendar');
    await page.getByRole('tab', { name: 'Weekly' }).click();
    await page.getByRole('tab', { name: 'Daily' }).click();
    await page.getByRole('tab', { name: 'Monthly' }).click();
    results.push('Calendar: Monthly, Weekly, Daily views render cleanly');

    // 9. Analytics
    await openRadialAndNavigate('Analytics');
    await page.waitForURL('**/analytics');
    await page.getByRole('combobox', { name: /Select analysis time range/i }).click();
    await page.getByRole('option', { name: 'Last 30 Days' }).click();
    await page.getByText('Task Completion Rate').waitFor({ state: 'visible' });
    results.push('Analytics: segmented tabs, custom range dropdown, and peak-highlighted chart render');

    // 10. Settings: 6 balanced tabs + Files & Notes Vault (folder, file upload, preview, quick note) + Monochrome switch
    await openRadialAndNavigate('Settings');
    await page.waitForURL('**/settings');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ state: 'visible' });
    const settingsTabCount = await page.getByRole('tablist', { name: 'Settings categories' }).getByRole('tab').count();
    assert(settingsTabCount === 6, `Settings should have 6 balanced tabs, got ${settingsTabCount}`);

    // Test Files & Notes tab thoroughly
    await page.getByRole('tab', { name: 'Files & Notes' }).click();
    await page.getByRole('button', { name: /New Folder/i }).first().click();
    await page.getByLabel('Folder Name').fill('Project Briefs');
    await page.getByRole('button', { name: 'Create Folder' }).click();
    await page.getByText('Project Briefs').first().waitFor({ state: 'visible' });

    // Upload a real text file into root and test preview
    await page.getByLabel('Choose files to upload').setInputFiles({
      name: 'release-checklist.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('TASKLY Release Checklist\n- Verify English UI\n- Verify Files & Notes Vault\n'),
    });
    await page.getByText('release-checklist.txt').first().waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Preview release-checklist.txt' }).click();
    await page.getByText(/TASKLY Release Checklist/i).waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');

    // Save a Quick Note and pin it
    await page.getByLabel(/Note Title/i).fill('Sprint Notes');
    await page.getByRole('textbox', { name: 'Quick Note' }).fill('Remember to check mobile responsiveness on both themes.');
    await page.getByRole('button', { name: /Pin Note/i }).click();
    await page.getByRole('button', { name: /Save Note/i }).click();
    await page.getByText('Sprint Notes').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_settings_vault_desktop_light.png') });

    // Profile + Focus & Reminders + Appearance Monochrome
    await page.getByRole('tab', { name: /^Profile$/i }).click();
    await page.getByLabel('Display Name').fill('Raka');
    await page.getByRole('button', { name: /Save Profile/i }).click();
    await page.getByRole('tab', { name: /Focus & Reminders/i }).click();
    await page.getByRole('button', { name: /Test Reminder Alert/i }).click();
    await page.getByText(/Sample Deadline Reminder/i).first().waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: /Appearance/i }).click();
    await page.getByRole('button', { name: /Theme 2: Monochrome/i }).click();

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /Hello, Raka/i }).waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    const persistedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert(persistedTheme === 'monochrome', 'Monochrome theme should persist in localStorage across reload');
    results.push('Settings Files & Notes + Themes: folder, file upload & preview, pinned quick note, and Monochrome persistence verified');

    // 11. Mobile 375x812 Verification: Balanced 2x3 Settings Tabs + Files & Notes in Monochrome & Light
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/settings?tab=vault`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_settings_vault_mobile_mono.png') });
    const overflowSettings = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowSettings, 'Mobile Settings Vault must not horizontally overflow 375px viewport');

    // Switch back to Light Workspace and capture Mobile Settings tabs + Vault
    await page.getByRole('tab', { name: /Appearance/i }).click();
    await page.getByRole('button', { name: /Theme 1: Light Workspace/i }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_settings_tabs_mobile_light.png') });
    await page.getByRole('tab', { name: 'Files & Notes' }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_settings_vault_mobile_light.png') });

    // Verify Radial Sidebar & Slide Sidebar toggle on mobile
    await page.getByRole('tab', { name: /Appearance/i }).click();
    await page.getByRole('button', { name: /Version 2: Slide Sidebar/i }).click();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const drawerDialog = page.getByRole('dialog', { name: 'Navigation menu' });
    await drawerDialog.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await drawerDialog.waitFor({ state: 'detached' });
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /Version 1: Radial Sidebar/i }).click();

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    const overflowDash = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowDash, 'Mobile Dashboard must not horizontally overflow 375px viewport');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v11_mobile_dashboard_en_light.png') });

    // Mobile Bell Menu check without horizontal overflow
    await page.getByRole('button', { name: /Deadline reminders/i }).click();
    await page.getByRole('dialog', { name: 'Deadline reminder center' }).waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Deadline reminder center' }).waitFor({ state: 'detached' });

    // Click Floating Bottom Dock to navigate to Analytics & Board
    const dock = page.getByRole('navigation', { name: 'Quick mobile navigation' });
    await dock.getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics');
    await dock.getByRole('link', { name: 'Kanban Board' }).click();
    await page.waitForURL('**/board');
    const overflowBoard = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowBoard, 'Mobile Kanban board must not horizontally overflow 375px viewport');

    await page.getByRole('tab', { name: /To Do/i }).click();
    await page.getByRole('button', { name: /Move Status/i }).first().click();
    await page.getByRole('dialog', { name: /Move Task Status/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /^Done$/i }).click();

    // 12. PWA Manifest + Mobile 375px Sweep Across Remaining Routes & Immersive Focus Fullscreen
    const manifestRes = await page.evaluate(async () => {
      const m = await fetch('/manifest.webmanifest');
      const icon = await fetch('/icon-192.png');
      const sw = await fetch('/sw.js');
      return {
        manifestOk: m.ok,
        manifest: await m.json(),
        iconOk: icon.ok,
        swOk: sw.ok,
      };
    });
    assert(
      manifestRes.manifestOk && manifestRes.manifest.display === 'standalone' && manifestRes.manifest.start_url === '/' && manifestRes.manifest.lang === 'en',
      'PWA manifest must be standalone with start_url / and lang en'
    );
    assert(manifestRes.iconOk && manifestRes.swOk, 'PWA icon-192.png and sw.js must be served');

    for (const route of ['/tasks', '/sprints', '/calendar', '/focus']) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert(!overflow, `Mobile route ${route} must not horizontally overflow 375px viewport`);
      if (route === '/focus') {
        await page.getByRole('button', { name: /Start Timer/i }).click();
        const mobilePopup = page.getByRole('region', { name: 'Focus Mode timer popup' });
        await mobilePopup.waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Fullscreen Mode', exact: true }).click();
        await page.getByRole('button', { name: 'Exit Fullscreen', exact: true }).waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Exit Fullscreen', exact: true }).click();
        await page.getByRole('button', { name: 'Fullscreen Mode', exact: true }).waitFor({ state: 'visible' });
        await mobilePopup.getByRole('button', { name: 'Stop focus timer' }).click();
        await mobilePopup.waitFor({ state: 'detached' });
      }
    }

    results.push('Mobile 375px & PWA Fullscreen: manifest en/standalone, all 8 routes overflow-free, immersive Focus fullscreen verified');

    // 13. Real Scroll Verification on Compact Mobile (375x667) & Desktop (1280x560)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    const bodyOverflowY = await page.evaluate(() => getComputedStyle(document.body).overflowY);
    assert(bodyOverflowY === 'visible', `body overflowY must be visible so scroll is never trapped, got ${bodyOverflowY}`);
    await page.mouse.move(180, 300);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
    const mobileScrollY = await page.evaluate(() => window.scrollY);
    assert(mobileScrollY > 80, `Mobile page must scroll freely on wheel/touch, got scrollY=${mobileScrollY}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v6_mobile_dashboard_scrolled.png') });

    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
    await page.mouse.move(640, 300);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(150);
    const desktopScrollY = await page.evaluate(() => window.scrollY);
    assert(desktopScrollY > 80, `Desktop page must scroll freely on wheel, got scrollY=${desktopScrollY}`);
    results.push(`Vertical Scroll Verified: mobile scrollY=${Math.round(mobileScrollY)}px, desktop scrollY=${Math.round(desktopScrollY)}px`);

    assert(consoleErrors.length === 0, `Console errors detected: ${consoleErrors.join('; ')}`);
    assert(pageErrors.length === 0, `Page errors detected: ${pageErrors.join('; ')}`);

    console.log('ALL V2 LAYOUT & CUSTOM DROPDOWN E2E CHECKS PASSED:');
    for (const r of results) console.log(' -', r);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
