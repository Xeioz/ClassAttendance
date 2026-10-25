// Production-browser checks. Supply PLAYWRIGHT_MODULE when Playwright is installed externally.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const require = createRequire(import.meta.url);
const output = path.resolve(process.env.QA_OUTPUT || 'artifacts/next-release-browser');
const base = process.env.QA_BASE_PATH || '/';
const port = process.env.QA_PORT || '4178';
const url = `http://127.0.0.1:${port}${base}`;
await fs.mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--configLoader',
    'runner',
    '--host',
    '127.0.0.1',
    '--port',
    port,
    '--strictPort',
    '--base',
    base,
    '--outDir',
    process.env.QA_DIST || 'dist',
  ],
  { stdio: 'ignore' },
);
const results = { syntheticData: true, url, checks: [], accessibility: [], pageErrors: [] };
let browser;
const pin = '123456789012';
const csv = (rows) => ({
  name: 'synthetic-roster.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from('id,name,section\n' + rows.join('\n') + '\n'),
});
const roster = (page) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Class roster', exact: true }) });
const form = (page) =>
  page.locator('form').filter({ has: page.locator('select[name="savedTemplate"]') });
async function upload(page, rows) {
  await page.getByLabel('Choose or drop a CSV').setInputFiles(csv(rows));
  await roster(page).getByText('Total parsed rows:', { exact: false }).waitFor();
}
async function saveRoster(page, added, updated) {
  await roster(page)
    .getByRole('button', { name: `Save ${added} additions and ${updated} updates`, exact: true })
    .click();
  await roster(page)
    .getByText(`Roster saved encrypted. Added: ${added}; updated: ${updated};`, { exact: false })
    .waitFor();
}
async function unlock(page) {
  await page.getByRole('button', { name: 'Teacher workspace', exact: true }).click();
  await page.getByLabel('Master PIN (6–12 digits)', { exact: true }).fill(pin);
  await page.getByRole('button', { name: 'Unlock teacher workspace', exact: true }).click();
  await form(page).waitFor({ state: 'attached' });
}
async function axe(page, screen) {
  // Serve instrumentation from this origin so the real CSP stays enforced.
  const axeUrl = new URL('__qa__/axe.js', url).href;
  await page.route(axeUrl, async (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8'),
    }),
  );
  await page.addScriptTag({ url: axeUrl });
  const report = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return {
      violations: r.violations.map(({ id, impact, description, nodes }) => ({
        id,
        impact,
        description,
        targets: nodes.map((n) => n.target),
      })),
      incomplete: r.incomplete.map(({ id }) => id),
      passedRules: r.passes.length,
    };
  });
  results.accessibility.push({ screen, ...report });
  assert.equal(report.violations.length, 0, `${screen}: ${JSON.stringify(report.violations)}`);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => results.pageErrors.push(error.message));
  await page.goto(url);
  assert.equal(await page.getByLabel('Student ID', { exact: true }).count(), 1);
  assert.equal(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) => /\/TeacherPortal-/.test(entry.name)),
    ),
    false,
  );
  const policy = await page.evaluate(
    () =>
      new Promise((resolve) => {
        document.addEventListener(
          'securitypolicyviolation',
          (event) => resolve({ directive: event.effectiveDirective, blocked: event.blockedURI }),
          { once: true },
        );
        const script = document.createElement('script');
        script.textContent = 'window.__injectedScriptRan = true';
        document.head.append(script);
      }),
  );
  assert.equal(policy.directive, 'script-src-elem');
  assert.equal(await page.evaluate(() => window.__injectedScriptRan === true), false);
  assert.equal(await page.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel('Student ID', { exact: true }).fill('00-2');
  await page.getByLabel('Room challenge', { exact: true }).fill('492');
  await page.getByRole('button', { name: 'Display QR pass', exact: true }).click();
  await page.getByRole('img', { name: 'Attendance pass for student 002', exact: true }).waitFor();
  const syntheticQr = await page
    .locator('canvas')
    .evaluate((canvas) => canvas.toDataURL('image/png'));
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  await page.screenshot({ path: `${output}/student-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  results.checks.push(
    'Student entry defers teacher module loading; mobile QR generated; production CSP blocks inline script; no-referrer present',
  );
  await page.getByRole('button', { name: 'Teacher workspace', exact: true }).click();
  await axe(page, 'Create workspace');
  await page.getByLabel('Master PIN (6–12 digits)', { exact: true }).fill(pin);
  await page.keyboard.press('Tab');
  assert.equal(
    await page.getByLabel('Confirm new PIN').evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.type(pin);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await form(page).waitFor();
  await upload(page, ['00-1,Demo Alice,A', '002,Demo Bob,A']);
  await saveRoster(page, 2, 0);
  await form(page).getByLabel('Template name', { exact: true }).fill('Morning synthetic class');
  await form(page).getByRole('button', { name: 'Save new template', exact: true }).click();
  assert.equal(
    await form(page).getByLabel('Course', { exact: true }).getAttribute('aria-invalid'),
    'true',
  );
  assert.equal(
    await form(page)
      .getByLabel('Course', { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await form(page).getByLabel('Course', { exact: true }).fill('SYN101');
  await form(page).getByText('Report details and timezone (optional)', { exact: true }).click();
  await form(page).getByLabel('Room (optional)', { exact: true }).fill('Synthetic room');
  await form(page).getByRole('button', { name: 'Save new template', exact: true }).click();
  await page.getByText('Saved template “Morning synthetic class”.', { exact: true }).waitFor();
  await form(page).getByRole('button', { name: 'Duplicate saved template', exact: true }).click();
  await form(page).getByLabel('Template name', { exact: true }).fill('Independent afternoon class');
  await form(page).getByLabel('Course', { exact: true }).fill('SYN202');
  await form(page).getByRole('button', { name: 'Update selected template', exact: true }).click();
  await page
    .getByText(
      'Updated template “Independent afternoon class”. Existing sessions stay unchanged.',
      { exact: true },
    )
    .waitFor();
  await form(page)
    .getByLabel('Saved class template')
    .selectOption({ label: 'Morning synthetic class' });
  assert.equal(await form(page).getByLabel('Course', { exact: true }).inputValue(), 'SYN101');
  assert.equal(await form(page).getByLabel('Room challenge', { exact: true }).inputValue(), '');
  await form(page).getByRole('button', { name: 'Generate room challenge', exact: true }).click();
  assert.match(
    await form(page).getByLabel('Room challenge', { exact: true }).inputValue(),
    /^\d{6}$/,
  );
  await form(page)
    .getByLabel("Start time (this device's timezone)", { exact: true })
    .fill('2020-01-01T00:00');
  await form(page).getByRole('button', { name: 'Use current time', exact: true }).click();
  assert.notEqual(
    await form(page)
      .getByLabel("Start time (this device's timezone)", { exact: true })
      .inputValue(),
    '2020-01-01T00:00',
  );
  assert.equal(
    await page.getByRole('heading', { name: 'Record attendance', exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: 'Test camera', exact: true }).click();
  await page.getByText(/Camera test failed:/).waitFor();
  await axe(page, 'Templates and readiness');
  await form(page).screenshot({ path: `${output}/templates-readiness-after.png` });
  results.checks.push(
    'Keyboard workspace creation, field-linked validation, template creation/duplication/independent edit, explicit start and fresh challenge; camera failure retains manual alternative',
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await form(page).getByRole('button', { name: 'Check offline readiness', exact: true }).click();
  await page.getByText('Required website resources cached.', { exact: false }).first().waitFor();
  await context.setOffline(true);
  await page.reload();
  const offlineGuide = await page.evaluate(async () => {
    const response = await fetch(new URL('guide.html', location.href));
    return { ok: response.ok, text: (await response.text()).replace(/\s+/g, ' ') };
  });
  assert.equal(offlineGuide.ok, true);
  assert.match(offlineGuide.text, /Class templates and preparation/);
  assert.match(offlineGuide.text, /supported older backups restore with no templates/);
  await unlock(page);
  await form(page)
    .getByLabel('Saved class template')
    .selectOption({ label: 'Morning synthetic class' });
  assert.equal(await form(page).getByLabel('Course', { exact: true }).inputValue(), 'SYN101');
  await page.getByRole('heading', { name: 'Pre-class readiness', exact: true }).waitFor();
  await context.setOffline(false);
  results.checks.push(
    'Encrypted templates, bundled English and the updated teacher guide work during an offline production tab reload; this is not a cold device restart',
  );
  await upload(page, [
    '001,Demo Alice Revised,A',
    '002,Demo Bob,A',
    '003,Demo Carla,A',
    '00-3,Colliding identity,A',
    ',Missing identity,A',
  ]);
  assert.equal(
    await roster(page)
      .getByRole('button', { name: /^Save / })
      .isDisabled(),
    true,
  );
  await roster(page).getByRole('button', { name: 'Cancel roster review', exact: true }).click();
  await upload(page, ['001,Demo Alice Revised,A', '002,Demo Bob,A', '003,Demo Carla,A']);
  await roster(page).getByText('Existing: Demo Alice', { exact: true }).waitFor();
  await roster(page).getByText('Proposed: Demo Alice Revised', { exact: true }).waitFor();
  assert.equal(
    await roster(page)
      .getByRole('button', { name: 'Save 1 additions and 1 updates', exact: true })
      .isDisabled(),
    true,
  );
  await roster(page)
    .getByRole('checkbox', { name: /Approve update/ })
    .check();
  await axe(page, 'Roster change review');
  await roster(page).screenshot({ path: `${output}/roster-review-after.png` });
  await saveRoster(page, 1, 1);
  await upload(page, ['004,Demo Dana,A']);
  const other = await context.newPage();
  await other.goto(url);
  await unlock(other);
  await upload(other, ['005,Demo Evan,A']);
  await saveRoster(other, 1, 0);
  await other.close();
  await roster(page)
    .getByRole('button', { name: 'Save 1 additions and 0 updates', exact: true })
    .click();
  await roster(page)
    .getByText('The roster changed in another operation.', { exact: false })
    .waitFor();
  await saveRoster(page, 1, 0);
  results.checks.push(
    'Invalid/conflicting import blocked; cancel unchanged; before/after update approval; two-tab stale comparison requires second explicit save; omitted students retained',
  );
  await form(page).getByLabel('Room challenge', { exact: true }).fill('492');
  await form(page).getByText('5 students match the selected section.', { exact: true }).waitFor();
  await form(page).getByRole('button', { name: 'Create attendance session', exact: true }).click();
  await page
    .getByRole('button', { name: 'Manual check-in / correction (F2)', exact: true })
    .waitFor();
  await page.evaluate(async (imageData) => {
    const original = navigator.mediaDevices.getUserMedia;
    const image = new Image();
    image.src = imageData;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    const draw = () => {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 640, 480);
      context.drawImage(image, 160, 80, 320, 320);
    };
    draw();
    const stream = canvas.captureStream(10);
    const timer = setInterval(draw, 100);
    navigator.mediaDevices.getUserMedia = async () => stream;
    window.__qaMedia = {
      stream,
      restore() {
        clearInterval(timer);
        navigator.mediaDevices.getUserMedia = original;
        stream.getTracks().forEach((track) => track.stop());
      },
    };
  }, syntheticQr);
  await page.getByLabel('Use compatibility decoder', { exact: true }).check();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'Demo Bob' })
    .filter({ hasText: 'PRESENT' })
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await page.waitForFunction(() =>
    window.__qaMedia.stream.getTracks().every((track) => track.readyState === 'ended'),
  );
  await page.evaluate(() => window.__qaMedia.restore());
  results.checks.push(
    'Bundled compatibility decoder scanned a generated QR from a synthetic canvas camera, committed attendance and released the stream; no physical camera claim',
  );
  await page.keyboard.press('F2');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByLabel('Enrolled student').selectOption({ label: 'Demo Alice Revised · 001' });
  await dialog.getByRole('combobox', { name: /^Status/ }).selectOption('EXCUSED');
  await dialog.getByLabel('Required reason').fill('Synthetic browser verification');
  await axe(page, 'Manual attendance dialog');
  await dialog.getByRole('button', { name: 'Save attendance', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page
    .getByRole('row')
    .filter({ hasText: 'Demo Alice Revised' })
    .filter({ hasText: 'EXCUSED' })
    .first()
    .waitFor();
  const preparation = page.locator('details').filter({ has: form(page) });
  if (!(await preparation.getAttribute('open')))
    await preparation.locator(':scope > summary').click();
  await form(page)
    .getByLabel('Saved class template')
    .selectOption({ label: 'Independent afternoon class' });
  await form(page).getByRole('button', { name: 'Remove selected template', exact: true }).click();
  await form(page).getByRole('button', { name: 'Confirm remove template', exact: true }).click();
  await page
    .getByText(
      'Removed template “Independent afternoon class”. Existing sessions stay unchanged.',
      { exact: true },
    )
    .waitFor();
  await page.locator('#active-session').getByRole('heading', { name: 'SYN101 / A' }).waitFor();
  const backupEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  const backup = await backupEvent;
  const backupPath = `${output}/synthetic-backup.json`;
  await backup.saveAs(backupPath);
  for (const name of ['Download Excel report', 'Download CSV']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const file = await download;
    await file.saveAs(`${output}/${file.suggestedFilename()}`);
    assert.equal(await file.failure(), null);
  }
  results.checks.push('Excel and CSV downloaded successfully with the production CSP enforced');
  await page
    .getByText('Saving the file outside this device has not been verified.', { exact: false })
    .waitFor();
  results.checks.push(
    'New session uses all five current students; manual attendance saves after camera failure; template deletion leaves active session and attendance unchanged; backup request does not claim safe storage/recovery',
  );
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    'narrow layout overflow',
  );
  await page.screenshot({ path: `${output}/teacher-narrow-after.png`, fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    'tablet layout overflow',
  );
  await page.screenshot({ path: `${output}/teacher-tablet.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    '200% text overflow',
  );
  await page.screenshot({ path: `${output}/teacher-text-200-after.png`, fullPage: true });
  results.checks.push(
    '375px layout and 200% text enlargement retain page width; screenshots preserved; real assistive technology not tested',
  );
  const recovered = await browser.newContext();
  const recovery = await recovered.newPage();
  await recovery.goto(url);
  await recovery.getByRole('button', { name: 'Teacher workspace', exact: true }).click();
  await recovery.getByLabel('Encrypted JSON backup').setInputFiles(backupPath);
  await recovery.getByLabel('Backup Master PIN', { exact: true }).fill(pin);
  await recovery.getByLabel('Replace all attendance data currently in this browser').check();
  await recovery.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await recovery.getByRole('button', { name: 'Unlock teacher workspace', exact: true }).waitFor();
  await recovery.getByLabel('Master PIN (6–12 digits)', { exact: true }).fill(pin);
  await recovery.getByRole('button', { name: 'Unlock teacher workspace', exact: true }).click();
  await recovery
    .getByRole('button', { name: 'Manual check-in / correction (F2)', exact: true })
    .waitFor();
  await recovery
    .locator('details')
    .filter({ has: form(recovery) })
    .locator(':scope > summary')
    .click();
  await form(recovery)
    .getByLabel('Saved class template')
    .selectOption({ label: 'Morning synthetic class' });
  assert.equal(await form(recovery).getByLabel('Course', { exact: true }).inputValue(), 'SYN101');
  results.checks.push(
    'Downloaded v2 backup restored templates, current roster, active session and attendance into a fresh Chromium context; not a second physical device',
  );
  await recovery.getByRole('button', { name: 'Student pass', exact: true }).click();
  await recovery.getByRole('button', { name: 'Teacher workspace', exact: true }).click();
  await recovery.getByRole('button', { name: 'Unlock teacher workspace', exact: true }).waitFor();
  assert.equal(
    await recovery.getByRole('heading', { name: 'Record attendance', exact: true }).count(),
    0,
  );
  results.checks.push(
    'Switching to student view discards the unlocked teacher subtree and requires PIN on return',
  );

  // Isolate a real failed dynamic import without disabling the production CSP.
  const retryContext = await browser.newContext({ serviceWorkers: 'block' });
  const retryPage = await retryContext.newPage();
  await retryPage.route('**/TeacherPortal-*.js', (route) => route.abort());
  await retryPage.goto(url);
  await retryPage.getByRole('button', { name: 'Teacher workspace', exact: true }).click();
  await retryPage.getByRole('button', { name: 'Retry teacher workspace', exact: true }).waitFor();
  await retryPage.unroute('**/TeacherPortal-*.js');
  await retryPage.getByRole('button', { name: 'Retry teacher workspace', exact: true }).click();
  await retryPage.getByLabel('Confirm new PIN', { exact: true }).waitFor();
  assert.equal(new URL(retryPage.url()).hash, '#teacher');
  await retryContext.close();
  results.checks.push(
    'Failed teacher module request exposes retry; retry reloads directly into #teacher and recovers without deleting data',
  );
  assert.deepEqual(results.pageErrors, []);
  results.passed = true;
} catch (error) {
  results.passed = false;
  results.failure = error.stack;
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${output}/browser-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser?.close();
  server.kill('SIGTERM');
}
