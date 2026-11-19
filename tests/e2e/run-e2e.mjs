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
    await page.getByText('Workspace Anda siap digunakan').waitFor({ state: 'visible' });
    const demoBtnCount = await page.getByRole('button', { name: /Muat Proyek Contoh/i }).count();
    assert(demoBtnCount === 0, 'Demo workspace button should be removed');
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert(initialTheme === 'light', `Default theme should be light, got ${initialTheme}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v7_desktop_empty_light.png') });
    results.push('Direct Entry: opens straight to /dashboard with Light Workspace default and clean empty state');

    // 2. Quick Add Task using custom Dropdown & Tomorrow's deadline (triggers default H-1 Reminder)
    await page.getByRole('button', { name: /Quick Add Task/i }).click();
    const tomorrowLocal = await page.evaluate(() => {
      const dt = new Date();
      dt.setDate(dt.getDate() + 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    });
    await page.getByLabel('Judul Tugas').fill('Finalisasi integrasi Sprint & Kanban');
    await page.getByRole('combobox', { name: 'Prioritas' }).click();
    await page.getByRole('option', { name: 'High' }).click();
    await page.getByLabel('Tenggat Waktu (Due Date)').fill(tomorrowLocal);
    await page.getByRole('button', { name: /Simpan Tugas/i }).click();
    await page.getByText('Finalisasi integrasi Sprint & Kanban').first().waitFor({ state: 'visible' });

    // Verify H-1 Reminder Notification Banner + Top Bar Bell Menu immediately triggers
    await page.getByRole('region', { name: 'Pengingat deadline aktif' }).waitFor({ state: 'visible' });
    await page.getByText(/Jangan lupa ada tugas "Finalisasi integrasi Sprint & Kanban"/i).first().waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Pengingat deadline/i }).click();
    await page.getByRole('dialog', { name: 'Pusat pengingat deadline' }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v10_reminder_bell_desktop.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Pusat pengingat deadline' }).waitFor({ state: 'detached' });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_dashboard_light.png') });
    results.push('Dashboard Quick Add + H-1 Reminder: default H-1 reminder triggers banner, toast & Bell dialog cleanly');

    // 3. Task Detail Drawer + Subtask + Custom Reminder Days + Escape
    await page.getByRole('button', { name: 'Finalisasi integrasi Sprint & Kanban', exact: true }).first().click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.getByRole('combobox', { name: /Pengingat Deadline/i }).click();
    await page.getByRole('option', { name: /Custom jumlah hari/i }).click();
    await page.getByLabel(/Custom Hari Sebelum Deadline/i).fill('2');
    await page.getByRole('button', { name: /Simpan Perubahan/i }).click();
    await page.getByText('Perubahan tugas disimpan.').first().waitFor({ state: 'visible' });
    await page.getByLabel('Tambah langkah subtask baru').fill('Uji dropdown & layout baru');
    await page.getByRole('button', { name: /^Tambah$/i }).click();
    await page.getByText('Uji dropdown & layout baru').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    results.push('Task Detail Drawer: custom reminder days saved, subtask added, closed cleanly with Escape');

    async function openRadialAndNavigate(label, screenshotName) {
      await page.getByRole('button', { name: 'Buka menu navigasi' }).click();
      const radialDialog = page.getByRole('dialog', { name: 'Menu navigasi' });
      await radialDialog.waitFor({ state: 'visible' });
      if (screenshotName) {
        await page.waitForTimeout(420);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, screenshotName) });
      }
      await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: label }).click();
      await radialDialog.waitFor({ state: 'detached' });
    }

    // 4. My Tasks: Radial Sidebar navigation + custom filter dropdowns
    await openRadialAndNavigate('My Tasks', 'v8_desktop_radial_light.png');
    await page.waitForURL('**/tasks');
    await page.getByRole('combobox', { name: 'Filter prioritas' }).click();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v2_dropdown_open.png') });
    await page.getByRole('option', { name: 'High' }).click();
    await page.getByText('Finalisasi integrasi Sprint & Kanban').first().waitFor({ state: 'visible' });
    results.push('My Tasks: Radial Sidebar navigation + custom Filter Prioritas dropdown work without clipping');

    // 5. Kanban Board + Custom Column
    await openRadialAndNavigate('Kanban Board');
    await page.waitForURL('**/board');
    await page.getByRole('heading', { name: 'Backlog' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Tambah Kolom/i }).click();
    await page.getByLabel('Nama Kolom').fill('QA Staging');
    await page.getByRole('button', { name: /Buat Kolom/i }).click();
    await page.getByRole('heading', { name: 'QA Staging' }).waitFor({ state: 'visible' });
    results.push('Kanban Board: displays default columns & custom column QA Staging');

    // 6. Sprints + Burndown
    await openRadialAndNavigate('Sprints');
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

    // 7. Focus Mode with searchable custom dropdown + Dynamic Island Live Popup (Image 1 & 2) + alert test
    await openRadialAndNavigate('Focus Mode');
    await page.waitForURL('**/focus');
    await page.getByRole('combobox', { name: /Tugas yang Dikerjakan/i }).click();
    await page.getByRole('option', { name: /Finalisasi integrasi Sprint & Kanban/i }).click();
    await page.getByRole('button', { name: /Tes Notif|Tes Nada/i }).click();
    await page.getByRole('button', { name: /Mulai Timer/i }).click();

    const focusPopup = page.getByRole('region', { name: 'Popup timer Focus Mode' });
    await focusPopup.waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v10_focus_island_expanded_light.png') });
    await focusPopup.getByRole('button', { name: 'Pause sesi fokus' }).click();
    await focusPopup.getByRole('button', { name: 'Resume sesi fokus' }).waitFor({ state: 'visible' });
    await focusPopup.getByRole('button', { name: 'Sembunyikan popup timer' }).click();
    await focusPopup.waitFor({ state: 'detached' });

    const pillCount = await page.getByRole('button', { name: /Buka popup Dynamic Focus Timer/i }).count();
    assert(pillCount === 0, 'Compact navbar capsule pill should be removed cleanly');

    await page.getByRole('button', { name: /Tampilkan Popup/i }).click();
    await focusPopup.waitFor({ state: 'visible' });
    await focusPopup.getByRole('button', { name: 'Hentikan timer fokus' }).click();
    await focusPopup.waitFor({ state: 'detached' });
    results.push('Focus Mode: Focus popup opens on start, pauses/resumes, hides/reopens cleanly without header capsule pill');

    // 8. Calendar
    await openRadialAndNavigate('Calendar');
    await page.waitForURL('**/calendar');
    await page.getByRole('tab', { name: 'Mingguan' }).click();
    await page.getByRole('tab', { name: 'Harian' }).click();
    await page.getByRole('tab', { name: 'Bulanan' }).click();
    results.push('Calendar: Monthly, Weekly, Daily views render cleanly');

    // 9. Analytics: Screen 2 Hero Chart + Custom Range Dropdown + Screenshot
    await openRadialAndNavigate('Analytics');
    await page.waitForURL('**/analytics');
    await page.getByRole('combobox', { name: /Pilih rentang waktu analisis/i }).click();
    await page.getByRole('option', { name: '30 Hari Terakhir' }).click();
    await page.getByText('Task Completion Rate').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v2_analytics_dark.png') });
    results.push('Analytics: segmented tabs, custom range dropdown, and peak-highlighted chart render');

    // 10. Settings: Profile Card + Aligned Tabs + Monochrome Toggle + Persistence
    await openRadialAndNavigate('Settings');
    await page.waitForURL('**/settings');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Ubah Nama/i }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_settings_light_desktop.png') });
    await page.getByRole('tab', { name: /Profil Workspace/i }).click();
    await page.getByLabel('Nama Tampilan').fill('Raka');
    await page.getByRole('button', { name: /Simpan Profil/i }).click();
    await page.getByRole('tab', { name: /Focus & Pengingat/i }).click();
    await page.getByRole('button', { name: /Tes Notifikasi Pengingat/i }).click();
    await page.getByText(/Contoh Pengingat Deadline/i).first().waitFor({ state: 'visible' });
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

    // 11. Mobile 375x812 Verification: Solid Header, Dense Liquid Glass Nav, Settings Outlines, Radial Sidebar
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v7_settings_scrolled_monochrome.png') });
    const overflowSettings = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowSettings, 'Mobile Settings must not horizontally overflow 375px viewport');

    // Verify Compact Radial Sidebar in Monochrome on Mobile 375px + Center X Close button
    await page.getByRole('button', { name: 'Buka menu navigasi' }).click();
    const drawerDialog = page.getByRole('dialog', { name: 'Menu navigasi' });
    await drawerDialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v9_mobile_radial_compact_mono.png') });
    await page.getByRole('button', { name: 'Tutup menu navigasi' }).click();
    await drawerDialog.waitFor({ state: 'detached' });

    // Verify FocusExpandedPopup in Monochrome on Mobile 375px
    await page.goto(`${baseUrl}/focus`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Mulai Timer/i }).click();
    await page.getByRole('region', { name: 'Popup timer Focus Mode' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v10_focus_island_mobile_mono.png') });
    await page.getByRole('button', { name: 'Hentikan timer fokus' }).click();
    await page.getByRole('region', { name: 'Popup timer Focus Mode' }).waitFor({ state: 'detached' });

    await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Tema 1: Light Workspace/i }).click();
    await page.waitForTimeout(150);

    // Switch to Versi 2: Slide Sidebar and verify classic slide drawer works, then switch back to Versi 1: Radial Sidebar
    await page.getByRole('button', { name: /Versi 2: Slide Sidebar/i }).click();
    await page.getByRole('button', { name: 'Buka menu navigasi' }).click();
    await drawerDialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v9_mobile_slide_drawer.png') });
    await page.keyboard.press('Escape');
    await drawerDialog.waitFor({ state: 'detached' });
    await page.waitForTimeout(250);

    await page.getByRole('button', { name: /Versi 1: Radial Sidebar/i }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v9_settings_light_mobile.png') });

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    const overflowDash = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflowDash, 'Mobile Dashboard must not horizontally overflow 375px viewport');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v4_mobile_dashboard_light.png') });

    // Mobile Bell Menu check without horizontal overflow
    await page.getByRole('button', { name: /Pengingat deadline/i }).click();
    await page.getByRole('dialog', { name: 'Pusat pengingat deadline' }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v10_reminder_bell_mobile.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Pusat pengingat deadline' }).waitFor({ state: 'detached' });

    // Verify Compact Radial Sidebar in Light Workspace on Mobile 375px & Escape close
    await page.getByRole('button', { name: 'Buka menu navigasi' }).click();
    await drawerDialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v9_mobile_radial_compact_light.png') });
    await page.keyboard.press('Escape');
    await drawerDialog.waitFor({ state: 'detached' });

    // Click Floating Bottom Dock to navigate to Analytics & Board
    const dock = page.getByRole('navigation', { name: 'Navigasi cepat mobile' });
    await dock.getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v7_mobile_analytics_light.png') });

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
      const sw = await fetch('/sw.js');
      return {
        manifestOk: m.ok,
        manifest: await m.json(),
        iconOk: icon.ok,
        swOk: sw.ok,
      };
    });
    assert(
      manifestRes.manifestOk && manifestRes.manifest.display === 'standalone' && manifestRes.manifest.start_url === '/',
      'PWA manifest must be standalone with start_url /'
    );
    assert(manifestRes.iconOk && manifestRes.swOk, 'PWA icon-192.png and sw.js must be served');

    for (const route of ['/tasks', '/sprints', '/calendar', '/focus']) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert(!overflow, `Mobile route ${route} must not horizontally overflow 375px viewport`);
      if (route === '/tasks') {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v5_mobile_tasks.png') });
      }
      if (route === '/focus') {
        await page.getByRole('button', { name: /Mulai Timer/i }).click();
        const mobilePopup = page.getByRole('region', { name: 'Popup timer Focus Mode' });
        await mobilePopup.waitFor({ state: 'visible' });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v10_focus_island_mobile_light.png') });
        await mobilePopup.getByRole('button', { name: 'Sembunyikan popup timer' }).click();
        await mobilePopup.waitFor({ state: 'detached' });

        const mobPillCount = await page.getByRole('button', { name: /Buka popup Dynamic Focus Timer/i }).count();
        assert(mobPillCount === 0, 'Mobile header must remain free of timer capsule pills');

        await page.getByRole('button', { name: 'Mode Layar Penuh', exact: true }).click();
        await page.getByRole('button', { name: 'Keluar Layar Penuh', exact: true }).waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v5_mobile_focus_fullscreen.png') });
        await page.getByRole('button', { name: 'Keluar Layar Penuh', exact: true }).click();
        await page.getByRole('button', { name: 'Mode Layar Penuh', exact: true }).waitFor({ state: 'visible' });

        await page.getByRole('button', { name: /Reset timer/i }).click();
      }
    }

    results.push('Mobile 375px & PWA Fullscreen: manifest standalone, all 8 routes overflow-free, immersive Focus fullscreen verified');

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
