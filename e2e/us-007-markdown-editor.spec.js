import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

async function writeFileEnsuringDir(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function setupE2E({ request }, testInfo) {
  const username = `e2e_${Date.now()}`;
  const password = 'password123';

  const statusRes = await request.get('/api/auth/status');
  const status = await statusRes.json();

  let token;
  if (status.needsSetup) {
    const registerRes = await request.post('/api/auth/register', { data: { username, password } });
    const registerData = await registerRes.json();
    expect(registerRes.ok()).toBeTruthy();
    token = registerData.token;
  } else {
    const loginRes = await request.post('/api/auth/login', { data: { username, password } });
    if (loginRes.ok()) {
      const loginData = await loginRes.json();
      token = loginData.token;
    } else {
      // If the system is already set up and the random user doesn't exist, tests should run against a dedicated test DB.
      throw new Error('Auth already set up. Set DATABASE_PATH to an isolated test DB for Playwright runs.');
    }
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  await request.post('/api/user/complete-onboarding', { headers: authHeaders });

  const workspaceDir = testInfo.outputPath('workspace');
  await fs.mkdir(workspaceDir, { recursive: true });

  const mdPath = path.join(workspaceDir, 'docs', 'note.md');
  await writeFileEnsuringDir(mdPath, '# Title\n\nHello\n');

  const createProjectRes = await request.post('/api/projects/create', {
    data: { path: workspaceDir },
    headers: authHeaders,
  });
  const createProjectData = await createProjectRes.json();
  expect(createProjectRes.ok()).toBeTruthy();

  const projectName = createProjectData.project.name;
  const displayName = `E2E Project ${Date.now()}`;

  const renameRes = await request.put(`/api/projects/${encodeURIComponent(projectName)}/rename`, {
    data: { displayName },
    headers: authHeaders,
  });
  expect(renameRes.ok()).toBeTruthy();

  return { token, authHeaders, projectName, displayName, workspaceDir, mdPath };
}

async function openMarkdownEditor(page, displayName, fileName) {
  await page.goto('/');

  // Select project in sidebar
  await page.getByText(displayName, { exact: true }).click();

  // Go to Files tab (desktop)
  await page.getByRole('button', { name: /files/i }).click();

  // Open the markdown file
  await page.getByRole('button', { name: fileName, exact: true }).click();
  await expect(page.getByTestId('md-editor-modal')).toBeVisible();
}

test('US-007 - Markdown editor key paths (autosave, preview, shortcut save, assets, fallback, conflict)', async ({ page, request }, testInfo) => {
  const { token, authHeaders, projectName, displayName, mdPath } = await setupE2E({ request }, testInfo);

  // Ensure the UI is authenticated
  await page.addInitScript((t) => localStorage.setItem('auth-token', t), token);

  await openMarkdownEditor(page, displayName, 'note.md');

  // Default mode should be "Vditor" (markdown editor)
  await expect(page.getByTestId('md-editor-mode')).toHaveText('Vditor');

  // Edit -> debounced save -> reopen consistent
  await page.locator('[data-testid="md-editor-edit"] .cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('# Title\n\nHello autosave\n');

  await expect(page.getByTestId('md-editor-status')).toHaveText('Saved');
  await expect.poll(async () => await fs.readFile(mdPath, 'utf8')).toContain('Hello autosave');

  // Edit/Preview toggle
  await page.getByTestId('md-editor-toggle-preview').click();
  await expect(page.getByTestId('md-editor-preview')).toBeVisible();
  await expect(page.getByTestId('md-editor-preview')).toContainText('Title');
  await page.getByTestId('md-editor-toggle-preview').click();

  // Ctrl/Cmd+S immediate save
  await page.locator('[data-testid="md-editor-edit"] .cm-content').click();
  await page.keyboard.type('\nImmediate save line\n');
  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('md-editor-status')).toHaveText('Saved');
  await expect.poll(async () => await fs.readFile(mdPath, 'utf8')).toContain('Immediate save line');

  // Drag/drop asset -> assets/ on disk -> reference inserted
  await page.evaluate(() => {
    const dt = new DataTransfer();
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    dt.items.add(new File([bytes], 'hello.txt', { type: 'text/plain' }));
    const el = document.querySelector('[data-testid="md-editor-dropzone"]');
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });

  await expect.poll(async () => {
    const raw = await page.getByTestId('md-editor-raw').inputValue();
    return raw.includes('assets/');
  }).toBeTruthy();

  // Save after insertion so we can assert disk state too
  await page.getByTestId('md-editor-save').click();
  await expect(page.getByTestId('md-editor-status')).toHaveText('Saved');

  const assetsDir = path.join(path.dirname(mdPath), 'assets');
  await expect.poll(async () => (await fs.readdir(assetsDir)).length).toBeGreaterThan(0);

  // Fallback: Vditor -> plain text -> back to Vditor; content consistent
  const beforeSwitch = await page.getByTestId('md-editor-raw').inputValue();
  await page.getByTestId('md-editor-toggle-mode').click();
  await expect(page.getByTestId('md-editor-mode')).toHaveText('Plain text');
  await expect(page.getByTestId('md-editor-raw')).toHaveValue(beforeSwitch);

  await page.locator('[data-testid="md-editor-edit"] .cm-content').click();
  await page.keyboard.type('\nPlain text edit\n');
  await page.getByTestId('md-editor-toggle-mode').click();
  await expect(page.getByTestId('md-editor-mode')).toHaveText('Vditor');
  await expect(page.getByTestId('md-editor-raw')).toContainText('Plain text edit');

  // Conflict branches: reload / overwrite / cancel
  // 1) Cancel
  await page.locator('[data-testid="md-editor-edit"] .cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('local-change-cancel\n');
  await writeFileEnsuringDir(mdPath, 'external-change-cancel\n');
  await page.getByTestId('md-editor-save').click();
  await expect(page.getByTestId('md-conflict-modal')).toBeVisible();
  await page.getByTestId('md-conflict-cancel').click();
  await expect(page.getByTestId('md-conflict-modal')).toBeHidden();
  await expect.poll(async () => await fs.readFile(mdPath, 'utf8')).toBe('external-change-cancel\n');
  await expect(page.getByTestId('md-editor-raw')).toHaveValue('local-change-cancel\n');

  // 2) Reload
  await page.getByTestId('md-editor-save').click();
  await expect(page.getByTestId('md-conflict-modal')).toBeVisible();
  await page.getByTestId('md-conflict-reload').click();
  await expect(page.getByTestId('md-conflict-modal')).toBeHidden();
  await expect(page.getByTestId('md-editor-raw')).toHaveValue('external-change-cancel\n');

  // 3) Overwrite
  await page.locator('[data-testid="md-editor-edit"] .cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('local-change-overwrite\n');
  await writeFileEnsuringDir(mdPath, 'external-change-overwrite\n');
  await page.getByTestId('md-editor-save').click();
  await expect(page.getByTestId('md-conflict-modal')).toBeVisible();
  await page.getByTestId('md-conflict-overwrite').click();
  await expect(page.getByTestId('md-conflict-modal')).toBeHidden();
  await expect.poll(async () => await fs.readFile(mdPath, 'utf8')).toBe('local-change-overwrite\n');

  // Close editor and reopen to ensure consistency
  await page.getByTestId('md-editor-close').click();
  await openMarkdownEditor(page, displayName, 'note.md');
  await expect(page.getByTestId('md-editor-raw')).toHaveValue('local-change-overwrite\n');

  // Sanity: API endpoints used above are project-scoped; ensure they work with encoded project name too.
  const readRes = await request.get(`/api/projects/${encodeURIComponent(projectName)}/file?filePath=${encodeURIComponent(mdPath)}`, {
    headers: authHeaders,
  });
  expect(readRes.ok()).toBeTruthy();
});
