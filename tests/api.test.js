// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../server/app.js';

let server;
let baseUrl;
let tokenA;
let tokenB;

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

beforeAll(async () => {
  const { app } = createApp({ dbPath: ':memory:' });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('TASKLY Backend API & Data Isolation', () => {
  it('registers two independent users and rejects duplicate email', async () => {
    const r1 = await req('/api/auth/register', {
      method: 'POST',
      body: { email: 'usera@taskly.test', password: 'password123', fullName: 'Pengguna A' },
    });
    expect(r1.status).toBe(201);
    expect(r1.data.token).toBeTruthy();
    tokenA = r1.data.token;

    const dup = await req('/api/auth/register', {
      method: 'POST',
      body: { email: 'usera@taskly.test', password: 'password123', fullName: 'Dup' },
    });
    expect(dup.status).toBe(409);

    const r2 = await req('/api/auth/register', {
      method: 'POST',
      body: { email: 'userb@taskly.test', password: 'password123', fullName: 'Pengguna B' },
    });
    expect(r2.status).toBe(201);
    tokenB = r2.data.token;
  });

  it('bootstraps 5 default Kanban columns and creates custom column with safe migration delete', async () => {
    const colsRes = await req('/api/columns', { token: tokenA });
    expect(colsRes.status).toBe(200);
    expect(colsRes.data.columns.map((c) => c.name)).toEqual([
      'Backlog',
      'To Do',
      'In Progress',
      'Review',
      'Done',
    ]);

    const custom = await req('/api/columns', {
      method: 'POST',
      token: tokenA,
      body: { name: 'QA Staging', semantic_type: 'review' },
    });
    expect(custom.status).toBe(201);
    const customId = custom.data.column.id;

    // Create task in custom column
    const taskRes = await req('/api/tasks', {
      method: 'POST',
      token: tokenA,
      body: { title: 'Verifikasi Staging', column_id: customId, priority: 'high' },
    });
    expect(taskRes.status).toBe(201);

    // Deleting without targetColumnId must be blocked
    const delFail = await req(`/api/columns/${customId}`, { method: 'DELETE', token: tokenA });
    expect(delFail.status).toBe(400);

    // Deleting with targetColumnId migrates the task safely
    const todoId = colsRes.data.columns.find((c) => c.semantic_type === 'todo').id;
    const delOk = await req(`/api/columns/${customId}`, {
      method: 'DELETE',
      token: tokenA,
      body: { targetColumnId: todoId },
    });
    expect(delOk.status).toBe(200);
    expect(delOk.data.migratedCount).toBe(1);
  });

  it('enforces strict user data isolation across users', async () => {
    const aTasks = await req('/api/tasks', { token: tokenA });
    expect(aTasks.data.tasks.length).toBe(1);
    const taskId = aTasks.data.tasks[0].id;

    const bList = await req('/api/tasks', { token: tokenB });
    expect(bList.data.tasks.length).toBe(0);

    const bReadA = await req(`/api/tasks/${taskId}`, { token: tokenB });
    expect(bReadA.status).toBe(404);

    const bDelA = await req(`/api/tasks/${taskId}`, { method: 'DELETE', token: tokenB });
    expect(bDelA.status).toBe(404);
  });

  it('supports Sprint lifecycle, Burndown calculation, Focus sessions, and Analytics', async () => {
    const colsRes = await req('/api/columns', { token: tokenA });
    const doneCol = colsRes.data.columns.find((c) => c.semantic_type === 'done');
    const aTasks = await req('/api/tasks', { token: tokenA });
    const taskId = aTasks.data.tasks[0].id;

    const spRes = await req('/api/sprints', {
      method: 'POST',
      token: tokenA,
      body: {
        name: 'Sprint Test 01',
        goal: 'Tuntaskan verifikasi',
        start_date: '2026-11-15',
        end_date: '2026-11-20',
        status: 'active',
        taskIds: [taskId],
      },
    });
    expect(spRes.status).toBe(201);
    const sprintId = spRes.data.sprint.id;

    // Move task to Done
    const moveRes = await req(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      token: tokenA,
      body: { column_id: doneCol.id },
    });
    expect(moveRes.status).toBe(200);
    expect(moveRes.data.task.completed_at).toBeTruthy();

    const spDet = await req(`/api/sprints/${sprintId}?today=2026-11-17`, { token: tokenA });
    expect(spDet.status).toBe(200);
    expect(spDet.data.sprint.progress_percent).toBe(100);
    expect(spDet.data.burndown.length).toBe(6);

    // Log focus session
    const focRes = await req('/api/focus/sessions', {
      method: 'POST',
      token: tokenA,
      body: {
        task_id: taskId,
        mode: 'focus',
        planned_duration_sec: 1500,
        actual_duration_sec: 1500,
        status: 'completed',
        started_at: '2026-11-17T08:00:00.000Z',
        ended_at: '2026-11-17T08:25:00.000Z',
      },
    });
    expect(focRes.status).toBe(201);

    const dash = await req('/api/dashboard?today=2026-11-17', { token: tokenA });
    expect(dash.status).toBe(200);
    expect(dash.data.counts.completed).toBe(1);
    expect(dash.data.daily_overview.focus_sec_today).toBe(1500);

    const analytics = await req('/api/analytics?range=7d&today=2026-11-17', { token: tokenA });
    expect(analytics.status).toBe(200);
    expect(analytics.data.summary.completion_rate).toBe(100);
    expect(analytics.data.summary.completed_focus_sessions).toBe(1);
  });
});
