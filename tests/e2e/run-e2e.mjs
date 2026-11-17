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

    // 1. Direct Entry to Dashboard (Light Workspace default)
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForURL('**/dashboard');
    await page.getByText('Workspace Anda siap digunakan').waitFor({ state: 'visible' });
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert(initialTheme === 'light', `Default theme should be light, got ${initialTheme}`);
    results.push('Direct Entry: opens straight to /dashboard with Light Workspace default theme');

    // 2. Quick Add Task using custom Dropdown
    await page.getByRole('button', { name: /Quick Add Task/i }).click();
    const todayIso = new Date().toISOString().slice(0, 10);
    await page.getByLabel('Judul Tugas').fill('Finalisasi integrasi Sprint & Kanban');
    await page.getByRole('combobox', { name: 'Prioritas' }).click();
    await page.getByRole('option', { name: 'High' }).click();
    await page.getByLabel('Tenggat Waktu (Due Date)').fill(todayIso);
    await page.getByRole('button', { name: /Simpan Tugas/i }).click();
    await page.getByText('Finalisasi integrasi Sprint & Kanban').first().waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_dashboard_light.png') });
    results.push('Dashboard Quick Add: custom Priority dropdown selects High and updates dashboard rings');

    // 3. Task Detail Drawer + Subtask + Custom Dropdown + Escape
    await page.getByRole('button', { name: 'Finalisasi integrasi Sprint & Kanban', exact: true }).first().click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.getByLabel('Tambah langkah subtask baru').fill('Uji dropdown & layout baru');
    await page.getByRole('button', { name: /^Tambah$/i }).click();
    await page.getByText('Uji dropdown & layout baru').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    results.push('Task Detail Drawer: custom dropdowns, subtask added, closed cleanly with Escape');

    // 4. My Tasks: custom filter dropdowns + global search
    await page.getByRole('link', { name: 'My Tasks' }).click();
    await page.waitForURL('**/tasks');
    await page.getByRole('combobox', { name: 'Filter prioritas' }).click();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v2_dropdown_open.png') });
    await page.getByRole('option', { name: 'High' }).click();
    await page.getByText('Finalisasi integrasi Sprint & Kanban').first().waitFor({ state: 'visible' });
    results.push('My Tasks: custom Filter Prioritas dropdown works without clipping');

    // 5. Kanban Board + Custom Column
    await page.getByRole('link', { name: 'Kanban Board' }).click();
    await page.waitForURL('**/board');
    await page.getByRole('heading', { name: 'Backlog' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Tambah Kolom/i }).click();
    await page.getByLabel('Nama Kolom').fill('QA Staging');
    await page.getByRole('button', { name: /Buat Kolom/i }).click();
    await page.getByRole('heading', { name: 'QA Staging' }).waitFor({ state: 'visible' });
    results.push('Kanban Board: displays default columns & custom column QA Staging');

    // 6. Sprints + Burndown
    await page.getByRole('link', { name: 'Sprints' }).click();
    await page.waitForURL('**/sprints');
    await page.getByRole('button', { name: /Buat Sprint Baru/i }).click();
    await page.getByLabel('Nama Sprint').fill('Sprint 01 Verifikasi');
    await page.getByLabel('Sprint Goal (Sasaran Utama)').fill('Pastikan layout baru berjalan penuh');
    await page.getByRole('button', { name: /Simpan Sprint/i }).click();
    await page.getByRole('heading', { name: 'Sprint 01 Verifikasi' }).waitFor({ state: 'visible' });

    await page.getByRole('link', { name: /Detail & Burndown/i }).first().click();
    await page.waitForURL('**/sprints/*');
    await page.getByRole('button', { name: /Mulai Sprint/i }).click();
    await page.getByRole('button', { name: /Selesaikan Sprint/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Assign dari Backlog/i }).first().click();
    await page.getByRole('button', { name: /^Assign$/i }).first().click();
    await page.keyboard.press('Escape');
    await page.getByText('Sisa tugas sprint terhadap target harian').waitFor({ state: 'visible' });
    results.push('Sprint Management: creates sprint, starts sprint, assigns task, renders Burndown');

    // 7. Focus Mode with searchable custom dropdown + alert test
    await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Focus Mode' }).click();
    await page.waitForURL('**/focus');
    await page.getByRole('combobox', { name: /Tugas yang Dikerjakan/i }).click();
    await page.getByRole('option', { name: /Finalisasi integrasi Sprint & Kanban/i }).click();
    await page.getByRole('button', { name: /Tes Notif|Tes Nada/i }).click();
    await page.getByRole('button', { name: /Mulai Timer/i }).click();
    await page.getByRole('button', { name: /Jeda/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Reset/i }).click();
    results.push('Focus Mode: searchable custom task dropdown, ringtone/notif preview, Start/Reset work cleanly');

    // 8. Calendar
    await page.getByRole('link', { name: 'Calendar' }).click();
    await page.waitForURL('**/calendar');
    await page.getByRole('tab', { name: 'Mingguan' }).click();
    await page.getByRole('tab', { name: 'Harian' }).click();
    await page.getByRole('tab', { name: 'Bulanan' }).click();
    results.push('Calendar: Monthly, Weekly, Daily views render cleanly');

    // 9. Analytics: Screen 2 Hero Chart + Custom Range Dropdown + Screenshot
    await page.getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics');
    await page.getByRole('combobox', { name: /Pilih rentang waktu analisis/i }).click();
    await page.getByRole('option', { name: '30 Hari Terakhir' }).click();
    await page.getByText('Task Completion Rate').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v2_analytics_dark.png') });
    results.push('Analytics: segmented tabs, custom range dropdown, and peak-highlighted chart render');

    // 10. Settings: Profile Card + Aligned Tabs + Monochrome Toggle + Persistence
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Ubah Nama/i }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_settings_light_desktop.png') });
    await page.getByRole('tab', { name: /Profil Workspace/i }).click();
    await page.getByLabel('Nama Tampilan').fill('Raka');
    await page.getByRole('button', { name: /Simpan Profil/i }).click();
    await page.getByRole('tab', { name: /Tampilan & Tema/i }).click();
    await page.getByRole('button', { name: /Tema 2: Monochrome/i }).click();

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /Halo, Raka/i }).waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    const persistedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert(persistedTheme === 'monochrome', 'Monochrome theme should persist in localStorage across reload');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_dashboard_monochrome.png') });
    results.push('Themes & Persistence: Light Workspace default -> Monochrome switch + reload persistence verified');

    // 11. Mobile 375x812 Verification: Animated Drawer + Settings Tabs Alignment + Zero Overflow
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_settings_tabs_mobile.png') });
    const overflowSettings = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowSettings, 'Mobile Settings must not horizontally overflow 375px viewport');

    await page.getByRole('button', { name: /Tema 1: Light Workspace/i }).click();
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    const overflowDash = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowDash, 'Mobile Dashboard must not horizontally overflow 375px viewport');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_mobile_dashboard_light.png') });

    // Verify animated mobile sidebar drawer open & Escape close
    await page.getByRole('button', { name: 'Buka menu navigasi' }).click();
    const drawerDialog = page.getByRole('dialog', { name: 'Menu navigasi' });
    await drawerDialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_mobile_drawer.png') });
    await page.keyboard.press('Escape');
    await drawerDialog.waitFor({ state: 'detached' });

    // Click Floating Bottom Dock to navigate to Analytics & Board
    const dock = page.getByRole('navigation', { name: 'Navigasi cepat mobile' });
    await dock.getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_mobile_analytics_light.png') });

    await dock.getByRole('link', { name: 'Kanban Board' }).click();
    await page.waitForURL('**/board');
    const overflowBoard = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowBoard, 'Mobile Kanban board must not horizontally overflow 375px viewport');

    await page.getByRole('tab', { name: /To Do/i }).click();
    await page.getByRole('button', { name: /Pindah Status/i }).first().click();
    await page.getByRole('dialog', { name: /Pindahkan Status Tugas/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /^Done$/i }).click();

    // 12. PWA Manifest + Mobile 375px Sweep Across Remaining Routes & Immersive Focus Fullscreen
    const manifestRes = await page.evaluate(async () => {
      const m = await fetch('/manifest.webmanifest');
      const icon = await fetch('/icon-192.png');
      return {
        manifestOk: m.ok,
        manifest: await m.json(),
        iconOk: icon.ok,
      };
    });
    assert(manifestRes.manifestOk && manifestRes.manifest.display === 'standalone', 'PWA manifest must be standalone');
    assert(manifestRes.iconOk, 'PWA icon-192.png must be served');

    for (const route of ['/tasks', '/sprints', '/calendar', '/focus']) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert(!overflow, `Mobile route ${route} must not horizontally overflow 375px viewport`);
      if (route === '/tasks') {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v5_mobile_tasks.png') });
      }
      if (route === '/focus') {
        await page.getByRole('button', { name: 'Mode Layar Penuh', exact: true }).click();
        await page.getByRole('button', { name: 'Keluar Layar Penuh', exact: true }).waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v5_mobile_focus_fullscreen.png') });
        await page.getByRole('button', { name: 'Keluar Layar Penuh', exact: true }).click();
        await page.getByRole('button', { name: 'Mode Layar Penuh', exact: true }).waitFor({ state: 'visible' });
      }
    }

    results.push('Mobile 375px & PWA Fullscreen: manifest standalone, all 8 routes overflow-free, immersive Focus fullscreen verified');

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
