import { addDaysIso, dateRangeDays, getTodayIso } from '../../utils/dateUtils.js';
import { vaultService } from '../vaultService.js';

const STORAGE_KEY = 'taskly_workspace_v1';

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function createInitialStore() {
  const now = new Date().toISOString();
  return {
    profile: {
      id: 'local-user',
      full_name: 'User',
      mode: 'local',
      created_at: now,
      updated_at: now,
    },
    settings: {
      theme: 'light',
      nav_style: 'radial',
      pomodoro_focus_min: 25,
      pomodoro_short_break_min: 5,
      pomodoro_long_break_min: 15,
      sound_enabled: true,
      reminder_enabled: true,
      default_reminder_days: 1,
      default_calendar_view: 'month',
      updated_at: now,
    },
    columns: [
      { id: createId(), name: 'Backlog', semantic_type: 'backlog', position: 0, is_default: true, created_at: now },
      { id: createId(), name: 'To Do', semantic_type: 'todo', position: 1, is_default: true, created_at: now },
      { id: createId(), name: 'In Progress', semantic_type: 'in_progress', position: 2, is_default: true, created_at: now },
      { id: createId(), name: 'Review', semantic_type: 'review', position: 3, is_default: true, created_at: now },
      { id: createId(), name: 'Done', semantic_type: 'done', position: 4, is_default: true, created_at: now },
    ],
    categories: [],
    labels: [],
    sprints: [],
    tasks: [],
    subtasks: [],
    sprint_tasks: [],
    focus_sessions: [],
    activity_logs: [],
  };
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialStore();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.columns) || parsed.columns.length === 0) {
      const initial = createInitialStore();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    if (parsed.profile?.full_name === 'Pengguna') {
      parsed.profile.full_name = 'User';
    }
    if (parsed.settings) {
      if (parsed.settings.reminder_enabled === undefined) parsed.settings.reminder_enabled = true;
      if (parsed.settings.default_reminder_days === undefined) parsed.settings.default_reminder_days = 1;
    }
    return parsed;
  } catch {
    return createInitialStore();
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    throw new Error('Failed to save data to browser localStorage.');
  }
}

function pushActivity(store, entityType, entityId, action, metadata = {}) {
  store.activity_logs.unshift({
    id: createId(),
    entity_type: entityType,
    entity_id: entityId,
    action,
    metadata,
    created_at: new Date().toISOString(),
  });
  if (store.activity_logs.length > 100) {
    store.activity_logs.length = 100;
  }
}

function enrichTasks(store, list) {
  const colMap = new Map(store.columns.map((c) => [c.id, c]));
  const catMap = new Map(store.categories.map((c) => [c.id, c]));
  const spMap = new Map(store.sprints.map((s) => [s.id, s]));
  const lblMap = new Map(store.labels.map((l) => [l.id, l]));

  return list.map((t) => {
    const col = colMap.get(t.column_id);
    const cat = t.category_id ? catMap.get(t.category_id) : null;
    const sp = t.sprint_id ? spMap.get(t.sprint_id) : null;
    const taskSubtasks = store.subtasks
      .filter((s) => s.task_id === t.id)
      .sort((a, b) => a.position - b.position);
    const taskLabels = (t.label_ids || [])
      .map((lid) => lblMap.get(lid))
      .filter(Boolean);

    return {
      ...t,
      column_name: col?.name || 'Unknown',
      semantic_type: col?.semantic_type || 'todo',
      category_name: cat?.name || null,
      category_color: cat?.color_token || null,
      sprint_name: sp?.name || null,
      sprint_status: sp?.status || null,
      subtasks: taskSubtasks,
      labels: taskLabels,
    };
  });
}

function computeSprintStats(store, sprintId) {
  const colMap = new Map(store.columns.map((c) => [c.id, c]));
  const spTasks = store.tasks.filter((t) => t.sprint_id === sprintId);
  const completed = spTasks.filter((t) => colMap.get(t.column_id)?.semantic_type === 'done').length;
  const total = spTasks.length;
  return {
    total_tasks: total,
    completed_tasks: completed,
    remaining_tasks: Math.max(0, total - completed),
    progress_percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

function computeBurndown(store, sprint, todayIso) {
  const days = dateRangeDays(sprint.start_date, sprint.end_date);
  if (days.length === 0) return [];

  const taskMap = new Map(store.tasks.map((t) => [t.id, t]));
  const historyRows = store.sprint_tasks.filter((st) => st.sprint_id === sprint.id && taskMap.has(st.task_id));
  const currentCount = store.tasks.filter((t) => t.sprint_id === sprint.id).length;

  const initialScope = Math.max(
    currentCount,
    historyRows.filter((r) => r.added_at.slice(0, 10) <= sprint.start_date).length
  );
  const denom = Math.max(1, days.length - 1);
  const effectiveToday =
    sprint.status === 'completed' || sprint.status === 'archived'
      ? sprint.completed_at
        ? sprint.completed_at.slice(0, 10)
        : sprint.end_date
      : todayIso;

  return days.map((d, idx) => {
    const ideal = days.length === 1 ? 0 : Number((initialScope * (1 - idx / denom)).toFixed(1));
    let actual = null;
    if (d <= effectiveToday) {
      let rem = 0;
      for (const item of historyRows) {
        const addedDay = item.added_at.slice(0, 10);
        const removedDay = item.removed_at ? item.removed_at.slice(0, 10) : null;
        if (addedDay <= d && (!removedDay || removedDay > d)) {
          const task = taskMap.get(item.task_id);
          const doneDay = task?.completed_at ? task.completed_at.slice(0, 10) : null;
          if (!doneDay || doneDay > d) rem += 1;
        }
      }
      actual = rem;
    }
    return { day: idx + 1, date: d, label: d.slice(5), ideal_remaining: ideal, actual_remaining: actual };
  });
}

function csvCell(val) {
  const s = String(val ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const localStorageAdapter = {
  mode: 'local',

  auth: {
    getToken: () => 'local-workspace',
    setToken: () => {},
    async me() {
      const store = readStore();
      return { user: store.profile, settings: store.settings };
    },
    async updateProfile(fullName) {
      const clean = String(fullName || '').trim();
      if (clean.length < 2) throw new Error('Display name must be at least 2 characters.');
      const store = readStore();
      store.profile.full_name = clean;
      store.profile.updated_at = new Date().toISOString();
      writeStore(store);
      return { user: store.profile };
    },
    async logout() {},
  },

  dashboard: {
    async getSummary() {
      const store = readStore();
      const today = getTodayIso();
      const next7 = addDaysIso(today, 7);
      const enriched = enrichTasks(store, store.tasks);

      const counts = {
        total: enriched.length,
        completed: enriched.filter((t) => t.semantic_type === 'done').length,
        in_progress: enriched.filter((t) => t.semantic_type === 'in_progress' || t.semantic_type === 'review').length,
        overdue: enriched.filter((t) => t.due_date && t.due_date < today && t.semantic_type !== 'done').length,
      };

      const activeSp = store.sprints.find((s) => s.status === 'active') || null;
      const active_sprint = activeSp ? { ...activeSp, ...computeSprintStats(store, activeSp.id) } : null;

      const prioOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const upcoming_deadlines = enriched
        .filter((t) => t.semantic_type !== 'done' && ((t.due_date && t.due_date <= next7) || t.priority === 'urgent' || t.priority === 'high'))
        .sort((a, b) => {
          const aOver = a.due_date && a.due_date < today ? 0 : 1;
          const bOver = b.due_date && b.due_date < today ? 0 : 1;
          if (aOver !== bOver) return aOver - bOver;
          if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
          if (Boolean(a.due_date) !== Boolean(b.due_date)) return a.due_date ? -1 : 1;
          return (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9);
        })
        .slice(0, 8);

      const completed_today = enriched.filter((t) => t.completed_at && t.completed_at.slice(0, 10) === today).length;
      const todayFocus = store.focus_sessions.filter(
        (fs) => (fs.mode === 'focus' || fs.mode === 'custom') && fs.started_at.slice(0, 10) === today
      );

      return {
        today,
        counts,
        active_sprint,
        upcoming_deadlines,
        daily_overview: {
          completed_today,
          focus_sec_today: todayFocus.reduce((acc, s) => acc + Number(s.actual_duration_sec || 0), 0),
          focus_sessions_today: todayFocus.filter((s) => s.status === 'completed').length,
        },
        recent_activities: store.activity_logs.slice(0, 10),
      };
    },
  },

  columns: {
    async list() {
      const store = readStore();
      return [...store.columns]
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          ...c,
          task_count: store.tasks.filter((t) => t.column_id === c.id).length,
        }));
    },
    async create({ name, semantic_type }) {
      const clean = String(name || '').trim();
      if (!clean || clean.length > 40) throw new Error('Column name is required (max 40 characters).');
      const store = readStore();
      const maxPos = store.columns.reduce((m, c) => Math.max(m, c.position), -1);
      const col = {
        id: createId(),
        name: clean,
        semantic_type: semantic_type || 'todo',
        position: maxPos + 1,
        is_default: false,
        created_at: new Date().toISOString(),
      };
      store.columns.push(col);
      pushActivity(store, 'column', col.id, 'column_created', { name: clean, semantic_type: col.semantic_type });
      writeStore(store);
      return { ...col, task_count: 0 };
    },
    async update(id, payload) {
      const store = readStore();
      const col = store.columns.find((c) => c.id === id);
      if (!col) throw new Error('Column not found.');
      if (payload.name !== undefined) {
        const clean = String(payload.name).trim();
        if (!clean) throw new Error('Column name is required.');
        col.name = clean;
      }
      if (payload.semantic_type !== undefined) col.semantic_type = payload.semantic_type;
      writeStore(store);
      return col;
    },
    async reorder(columnIds) {
      const store = readStore();
      columnIds.forEach((id, idx) => {
        const col = store.columns.find((c) => c.id === id);
        if (col) col.position = idx;
      });
      writeStore(store);
      return this.list();
    },
    async remove(id, targetColumnId) {
      const store = readStore();
      const col = store.columns.find((c) => c.id === id);
      if (!col) throw new Error('Column not found.');
      if (store.columns.length <= 2) throw new Error('Workspace must have at least 2 workflow columns.');
      if (col.semantic_type === 'done' && store.columns.filter((c) => c.semantic_type === 'done').length <= 1) {
        throw new Error('At least 1 Done column is required.');
      }
      if (col.semantic_type !== 'done' && store.columns.filter((c) => c.semantic_type !== 'done').length <= 1) {
        throw new Error('At least 1 active column besides Done is required.');
      }
      const inside = store.tasks.filter((t) => t.column_id === id);
      if (inside.length > 0) {
        const targetCol = store.columns.find((c) => c.id === targetColumnId && c.id !== id);
        if (!targetCol) throw new Error('Select a destination column to move existing tasks first.');
        const now = new Date().toISOString();
        inside.forEach((t) => {
          t.column_id = targetCol.id;
          t.completed_at = targetCol.semantic_type === 'done' ? t.completed_at || now : null;
          t.updated_at = now;
        });
      }
      store.columns = store.columns.filter((c) => c.id !== id);
      writeStore(store);
      return { deletedId: id, migratedCount: inside.length };
    },
  },

  taxonomy: {
    async listCategories() {
      const store = readStore();
      return [...store.categories].sort((a, b) => a.name.localeCompare(b.name));
    },
    async createCategory({ name, color_token = 'accent' }) {
      const clean = String(name || '').trim();
      if (!clean) throw new Error('Category name is required.');
      const store = readStore();
      if (store.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
        throw new Error('A category with that name already exists.');
      }
      const cat = { id: createId(), name: clean, color_token, created_at: new Date().toISOString() };
      store.categories.push(cat);
      writeStore(store);
      return cat;
    },
    async updateCategory(id, payload) {
      const store = readStore();
      const cat = store.categories.find((c) => c.id === id);
      if (!cat) throw new Error('Category not found.');
      if (payload.name !== undefined) cat.name = String(payload.name).trim();
      writeStore(store);
      return cat;
    },
    async deleteCategory(id) {
      const store = readStore();
      store.categories = store.categories.filter((c) => c.id !== id);
      store.tasks.forEach((t) => {
        if (t.category_id === id) t.category_id = null;
      });
      writeStore(store);
      return { deletedId: id };
    },
    async listLabels() {
      const store = readStore();
      return [...store.labels].sort((a, b) => a.name.localeCompare(b.name));
    },
    async createLabel({ name, color_token = 'secondary' }) {
      const clean = String(name || '').trim();
      if (!clean) throw new Error('Label name is required.');
      const store = readStore();
      if (store.labels.some((l) => l.name.toLowerCase() === clean.toLowerCase())) {
        throw new Error('A label with that name already exists.');
      }
      const lbl = { id: createId(), name: clean, color_token, created_at: new Date().toISOString() };
      store.labels.push(lbl);
      writeStore(store);
      return lbl;
    },
    async deleteLabel(id) {
      const store = readStore();
      store.labels = store.labels.filter((l) => l.id !== id);
      store.tasks.forEach((t) => {
        if (Array.isArray(t.label_ids)) t.label_ids = t.label_ids.filter((x) => x !== id);
      });
      writeStore(store);
      return { deletedId: id };
    },
  },

  tasks: {
    async list(filters = {}) {
      const store = readStore();
      const today = getTodayIso();
      let list = enrichTasks(store, store.tasks);

      if (filters.search) {
        const q = String(filters.search).trim().toLowerCase();
        list = list.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.labels || []).some((l) => l.name.toLowerCase().includes(q))
        );
      }
      if (filters.columnId) list = list.filter((t) => t.column_id === filters.columnId);
      if (filters.semanticType) list = list.filter((t) => t.semantic_type === filters.semanticType);
      if (filters.priority) list = list.filter((t) => t.priority === filters.priority);
      if (filters.categoryId) list = list.filter((t) => t.category_id === filters.categoryId);
      if (filters.sprintId === 'backlog') list = list.filter((t) => !t.sprint_id);
      else if (filters.sprintId) list = list.filter((t) => t.sprint_id === filters.sprintId);

      if (filters.deadline === 'overdue') {
        list = list.filter((t) => t.due_date && t.due_date < today && t.semantic_type !== 'done');
      } else if (filters.deadline === 'today') {
        list = list.filter((t) => t.due_date === today);
      } else if (filters.deadline === 'week') {
        const next7 = addDaysIso(today, 7);
        list = list.filter((t) => t.due_date && t.due_date >= today && t.due_date <= next7);
      } else if (filters.deadline === 'none') {
        list = list.filter((t) => !t.due_date);
      }

      const prioOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      if (filters.sort === 'due_date') {
        list.sort((a, b) => {
          if (Boolean(a.due_date) !== Boolean(b.due_date)) return a.due_date ? -1 : 1;
          if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
          return b.created_at.localeCompare(a.created_at);
        });
      } else if (filters.sort === 'priority') {
        list.sort((a, b) => (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9));
      } else if (filters.sort === 'updated_at') {
        list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      } else {
        list.sort((a, b) => a.position_in_column - b.position_in_column);
      }
      return list;
    },

    async get(id) {
      const store = readStore();
      const found = store.tasks.find((t) => t.id === id);
      if (!found) throw new Error('Task not found.');
      return enrichTasks(store, [found])[0];
    },

    async create(payload) {
      const title = String(payload.title || '').trim();
      if (!title || title.length > 160) throw new Error('Task title is required (max 160 characters).');
      const startDate = payload.start_date || null;
      const dueDate = payload.due_date || null;
      if (startDate && dueDate && dueDate < startDate) {
        throw new Error('Start date cannot be after the due date.');
      }

      const store = readStore();
      const defaultReminderDays = store.settings?.default_reminder_days ?? 1;
      const reminderDaysBefore =
        payload.reminder_days_before === undefined
          ? defaultReminderDays
          : payload.reminder_days_before === null || payload.reminder_days_before === ''
          ? null
          : Math.max(0, Math.min(60, Math.round(Number(payload.reminder_days_before))));
      if (reminderDaysBefore !== null && !Number.isFinite(reminderDaysBefore)) {
        throw new Error('Invalid reminder days value.');
      }
      const col =
        (payload.column_id ? store.columns.find((c) => c.id === payload.column_id) : null) ||
        store.columns.find((c) => c.semantic_type === 'todo') ||
        store.columns[0];
      if (!col) throw new Error('Kanban column not found.');

      const maxPos = store.tasks
        .filter((t) => t.column_id === col.id)
        .reduce((m, t) => Math.max(m, t.position_in_column), 0);

      const now = new Date().toISOString();
      const task = {
        id: createId(),
        column_id: col.id,
        category_id: payload.category_id || null,
        sprint_id: payload.sprint_id || null,
        assignee_id: store.profile.id,
        title,
        description: String(payload.description || ''),
        priority: payload.priority || 'medium',
        start_date: startDate,
        due_date: dueDate,
        reminder_days_before: reminderDaysBefore,
        position_in_column: typeof payload.position_in_column === 'number' ? payload.position_in_column : maxPos + 1000,
        label_ids: Array.isArray(payload.label_ids) ? [...new Set(payload.label_ids)] : [],
        completed_at: col.semantic_type === 'done' ? now : null,
        created_at: now,
        updated_at: now,
      };
      store.tasks.push(task);

      if (Array.isArray(payload.subtasks)) {
        payload.subtasks.forEach((st, idx) => {
          const stTitle = String(st?.title || '').trim();
          if (stTitle) {
            store.subtasks.push({
              id: createId(),
              task_id: task.id,
              title: stTitle,
              is_completed: Boolean(st?.is_completed),
              position: idx,
              created_at: now,
            });
          }
        });
      }

      if (task.sprint_id) {
        store.sprint_tasks.push({
          id: createId(),
          sprint_id: task.sprint_id,
          task_id: task.id,
          added_at: now,
          removed_at: null,
        });
      }

      pushActivity(store, 'task', task.id, 'task_created', { title: task.title, column_name: col.name });
      writeStore(store);
      return enrichTasks(store, [task])[0];
    },

    async update(id, payload) {
      const store = readStore();
      const task = store.tasks.find((t) => t.id === id);
      if (!task) throw new Error('Task not found.');

      const startDate = payload.start_date !== undefined ? payload.start_date : task.start_date;
      const dueDate = payload.due_date !== undefined ? payload.due_date : task.due_date;
      if (startDate && dueDate && dueDate < startDate) {
        throw new Error('Start date cannot be after the due date.');
      }

      const prevCol = store.columns.find((c) => c.id === task.column_id);
      const nextColumnId = payload.column_id ?? task.column_id;
      const nextCol = store.columns.find((c) => c.id === nextColumnId);
      if (!nextCol) throw new Error('Destination column not found.');

      const now = new Date().toISOString();
      if (payload.title !== undefined) {
        const clean = String(payload.title).trim();
        if (!clean) throw new Error('Task title is required.');
        task.title = clean;
      }
      if (payload.description !== undefined) task.description = String(payload.description);
      if (payload.priority !== undefined) task.priority = payload.priority;
      if (payload.category_id !== undefined) task.category_id = payload.category_id;
      if (payload.position_in_column !== undefined) task.position_in_column = payload.position_in_column;
      if (Array.isArray(payload.label_ids)) task.label_ids = [...new Set(payload.label_ids)];
      task.start_date = startDate;
      task.due_date = dueDate;
      if (payload.reminder_days_before !== undefined) {
        if (payload.reminder_days_before === null || payload.reminder_days_before === '') {
          task.reminder_days_before = null;
        } else {
          const parsedRem = Math.round(Number(payload.reminder_days_before));
          if (!Number.isFinite(parsedRem) || parsedRem < 0 || parsedRem > 60) {
            throw new Error('Reminder days must be between 0 and 60.');
          }
          task.reminder_days_before = parsedRem;
        }
      }
      task.column_id = nextColumnId;

      if (nextCol.semantic_type === 'done' && prevCol?.semantic_type !== 'done') {
        task.completed_at = now;
      } else if (nextCol.semantic_type !== 'done' && prevCol?.semantic_type === 'done') {
        task.completed_at = null;
      }

      if (payload.sprint_id !== undefined && payload.sprint_id !== task.sprint_id) {
        store.sprint_tasks.forEach((st) => {
          if (st.task_id === task.id && !st.removed_at) st.removed_at = now;
        });
        task.sprint_id = payload.sprint_id || null;
        if (task.sprint_id) {
          store.sprint_tasks.push({
            id: createId(),
            sprint_id: task.sprint_id,
            task_id: task.id,
            added_at: now,
            removed_at: null,
          });
        }
      }

      task.updated_at = now;
      if (nextColumnId !== prevCol?.id) {
        pushActivity(
          store,
          'task',
          task.id,
          nextCol.semantic_type === 'done' ? 'task_completed' : 'task_moved',
          { title: task.title, from_column: prevCol?.name || '', to_column: nextCol.name }
        );
      }

      writeStore(store);
      return enrichTasks(store, [task])[0];
    },

    async bulk({ taskIds, action, columnId, priority, sprintId }) {
      const store = readStore();
      const idSet = new Set(taskIds || []);
      const now = new Date().toISOString();

      if (action === 'delete') {
        store.tasks = store.tasks.filter((t) => !idSet.has(t.id));
        store.subtasks = store.subtasks.filter((s) => !idSet.has(s.task_id));
        store.sprint_tasks = store.sprint_tasks.filter((st) => !idSet.has(st.task_id));
      } else if (action === 'move_column') {
        const col = store.columns.find((c) => c.id === columnId);
        if (!col) throw new Error('Invalid destination column.');
        store.tasks.forEach((t) => {
          if (idSet.has(t.id)) {
            t.column_id = col.id;
            t.completed_at = col.semantic_type === 'done' ? t.completed_at || now : null;
            t.updated_at = now;
          }
        });
      } else if (action === 'set_priority') {
        store.tasks.forEach((t) => {
          if (idSet.has(t.id)) {
            t.priority = priority;
            t.updated_at = now;
          }
        });
      } else if (action === 'assign_sprint') {
        store.tasks.forEach((t) => {
          if (idSet.has(t.id)) {
            store.sprint_tasks.forEach((st) => {
              if (st.task_id === t.id && !st.removed_at) st.removed_at = now;
            });
            t.sprint_id = sprintId || null;
            t.updated_at = now;
            if (t.sprint_id) {
              store.sprint_tasks.push({
                id: createId(),
                sprint_id: t.sprint_id,
                task_id: t.id,
                added_at: now,
                removed_at: null,
              });
            }
          }
        });
      }

      writeStore(store);
      return { updatedCount: idSet.size };
    },

    async remove(id) {
      const store = readStore();
      const target = store.tasks.find((t) => t.id === id);
      if (!target) throw new Error('Task not found.');
      store.tasks = store.tasks.filter((t) => t.id !== id);
      store.subtasks = store.subtasks.filter((s) => s.task_id !== id);
      store.sprint_tasks = store.sprint_tasks.filter((st) => st.task_id !== id);
      store.focus_sessions.forEach((fs) => {
        if (fs.task_id === id) fs.task_id = null;
      });
      pushActivity(store, 'task', id, 'task_deleted', { title: target.title });
      writeStore(store);
      return { deletedId: id };
    },

    async addSubtask(taskId, title) {
      const clean = String(title || '').trim();
      if (!clean) throw new Error('Subtask title is required.');
      const store = readStore();
      const task = store.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error('Task not found.');
      const maxPos = store.subtasks
        .filter((s) => s.task_id === taskId)
        .reduce((m, s) => Math.max(m, s.position), -1);
      const now = new Date().toISOString();
      const st = {
        id: createId(),
        task_id: taskId,
        title: clean,
        is_completed: false,
        position: maxPos + 1,
        created_at: now,
      };
      store.subtasks.push(st);
      task.updated_at = now;
      writeStore(store);
      return st;
    },

    async updateSubtask(taskId, subtaskId, payload) {
      const store = readStore();
      const st = store.subtasks.find((s) => s.id === subtaskId && s.task_id === taskId);
      if (!st) throw new Error('Subtask not found.');
      if (payload.title !== undefined) st.title = String(payload.title).trim();
      if (payload.is_completed !== undefined) st.is_completed = Boolean(payload.is_completed);
      const task = store.tasks.find((t) => t.id === taskId);
      if (task) task.updated_at = new Date().toISOString();
      writeStore(store);
      return st;
    },

    async removeSubtask(taskId, subtaskId) {
      const store = readStore();
      store.subtasks = store.subtasks.filter((s) => !(s.id === subtaskId && s.task_id === taskId));
      const task = store.tasks.find((t) => t.id === taskId);
      if (task) task.updated_at = new Date().toISOString();
      writeStore(store);
      return { deletedId: subtaskId };
    },
  },

  sprints: {
    async list() {
      const store = readStore();
      const order = { active: 0, planned: 1, completed: 2, archived: 3 };
      return [...store.sprints]
        .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.start_date.localeCompare(a.start_date))
        .map((sp) => ({ ...sp, ...computeSprintStats(store, sp.id) }));
    },

    async detail(id) {
      const store = readStore();
      const sp = store.sprints.find((s) => s.id === id);
      if (!sp) throw new Error('Sprint not found.');
      const tasks = enrichTasks(
        store,
        store.tasks.filter((t) => t.sprint_id === id)
      );
      return {
        sprint: { ...sp, ...computeSprintStats(store, id) },
        tasks,
        burndown: computeBurndown(store, sp, getTodayIso()),
      };
    },

    async create(payload) {
      const name = String(payload.name || '').trim();
      if (!name) throw new Error('Sprint name is required.');
      if (payload.end_date < payload.start_date) {
        throw new Error('End date must be on or after the start date.');
      }
      const store = readStore();
      const now = new Date().toISOString();
      const sp = {
        id: createId(),
        name,
        description: String(payload.description || ''),
        goal: String(payload.goal || ''),
        start_date: payload.start_date,
        end_date: payload.end_date,
        status: payload.status || 'planned',
        completed_at: null,
        created_at: now,
        updated_at: now,
      };
      store.sprints.push(sp);
      pushActivity(store, 'sprint', sp.id, 'sprint_created', { name: sp.name, status: sp.status });
      writeStore(store);
      return { ...sp, ...computeSprintStats(store, sp.id) };
    },

    async update(id, payload) {
      const store = readStore();
      const sp = store.sprints.find((s) => s.id === id);
      if (!sp) throw new Error('Sprint not found.');
      const nextStart = payload.start_date ?? sp.start_date;
      const nextEnd = payload.end_date ?? sp.end_date;
      if (nextEnd < nextStart) throw new Error('End date must be on or after the start date.');
      if (payload.name !== undefined) sp.name = String(payload.name).trim();
      if (payload.description !== undefined) sp.description = String(payload.description);
      if (payload.goal !== undefined) sp.goal = String(payload.goal);
      if (payload.status !== undefined) sp.status = payload.status;
      sp.start_date = nextStart;
      sp.end_date = nextEnd;
      sp.updated_at = new Date().toISOString();
      writeStore(store);
      return { ...sp, ...computeSprintStats(store, sp.id) };
    },

    async start(id, forceCompleteActive = false) {
      const store = readStore();
      const sp = store.sprints.find((s) => s.id === id);
      if (!sp) throw new Error('Sprint not found.');
      const active = store.sprints.find((s) => s.status === 'active' && s.id !== id);
      if (active && !forceCompleteActive) {
        const err = new Error(`Sprint "${active.name}" is still active.`);
        err.code = 'ACTIVE_SPRINT_EXISTS';
        err.data = { activeSprint: active };
        throw err;
      }
      const now = new Date().toISOString();
      if (active) {
        active.status = 'completed';
        active.completed_at = now;
        active.updated_at = now;
        store.tasks.forEach((t) => {
          if (t.sprint_id === active.id && !t.completed_at) {
            t.sprint_id = null;
            t.updated_at = now;
          }
        });
        pushActivity(store, 'sprint', active.id, 'sprint_completed', { name: active.name });
      }
      sp.status = 'active';
      sp.updated_at = now;
      pushActivity(store, 'sprint', sp.id, 'sprint_started', { name: sp.name });
      writeStore(store);
      return { ...sp, ...computeSprintStats(store, sp.id) };
    },

    async complete(id, { carryoverAction = 'backlog', targetSprintId = null } = {}) {
      const store = readStore();
      const sp = store.sprints.find((s) => s.id === id);
      if (!sp) throw new Error('Sprint not found.');
      const colMap = new Map(store.columns.map((c) => [c.id, c]));
      const now = new Date().toISOString();

      store.tasks.forEach((t) => {
        if (t.sprint_id === id && colMap.get(t.column_id)?.semantic_type !== 'done') {
          store.sprint_tasks.forEach((st) => {
            if (st.sprint_id === id && st.task_id === t.id && !st.removed_at) st.removed_at = now;
          });
          if (carryoverAction === 'sprint' && targetSprintId) {
            t.sprint_id = targetSprintId;
            store.sprint_tasks.push({ id: createId(), sprint_id: targetSprintId, task_id: t.id, added_at: now, removed_at: null });
          } else {
            t.sprint_id = null;
          }
          t.updated_at = now;
        }
      });

      sp.status = 'completed';
      sp.completed_at = now;
      sp.updated_at = now;
      pushActivity(store, 'sprint', sp.id, 'sprint_completed', { name: sp.name });
      writeStore(store);
      return { ...sp, ...computeSprintStats(store, sp.id) };
    },

    async assignTask(sprintId, taskId, action = 'add') {
      const store = readStore();
      const task = store.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error('Task not found.');
      const now = new Date().toISOString();
      store.sprint_tasks.forEach((st) => {
        if (st.task_id === taskId && !st.removed_at) st.removed_at = now;
      });
      if (action === 'remove') {
        task.sprint_id = null;
      } else {
        task.sprint_id = sprintId;
        store.sprint_tasks.push({ id: createId(), sprint_id: sprintId, task_id: taskId, added_at: now, removed_at: null });
      }
      task.updated_at = now;
      writeStore(store);
      return { ok: true, stats: computeSprintStats(store, sprintId) };
    },

    async remove(id) {
      const store = readStore();
      const sp = store.sprints.find((s) => s.id === id);
      if (!sp) throw new Error('Sprint not found.');
      const now = new Date().toISOString();
      store.tasks.forEach((t) => {
        if (t.sprint_id === id) {
          t.sprint_id = null;
          t.updated_at = now;
        }
      });
      store.sprint_tasks = store.sprint_tasks.filter((st) => st.sprint_id !== id);
      store.sprints = store.sprints.filter((s) => s.id !== id);
      pushActivity(store, 'sprint', id, 'sprint_deleted', { name: sp.name });
      writeStore(store);
      return { deletedId: id };
    },
  },

  focus: {
    async listSessions(limit = 30) {
      const store = readStore();
      const taskMap = new Map(store.tasks.map((t) => [t.id, t]));
      return [...store.focus_sessions]
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, limit)
        .map((s) => ({
          ...s,
          task_label: s.task_id ? taskMap.get(s.task_id)?.title || 'Deleted task' : 'General Focus',
        }));
    },
    async getStats() {
      const store = readStore();
      const today = getTodayIso();
      const focusOnly = store.focus_sessions.filter((s) => s.mode === 'focus' || s.mode === 'custom');
      const todayOnly = focusOnly.filter((s) => s.started_at.slice(0, 10) === today);
      return {
        today_completed_sessions: todayOnly.filter((s) => s.status === 'completed').length,
        today_focus_sec: todayOnly.reduce((a, b) => a + Number(b.actual_duration_sec || 0), 0),
        total_sessions: focusOnly.length,
        total_focus_sec: focusOnly.reduce((a, b) => a + Number(b.actual_duration_sec || 0), 0),
      };
    },
    async logSession(payload) {
      const store = readStore();
      const task = payload.task_id ? store.tasks.find((t) => t.id === payload.task_id) : null;
      const session = {
        id: createId(),
        task_id: task ? task.id : null,
        mode: payload.mode || 'focus',
        planned_duration_sec: Math.round(Number(payload.planned_duration_sec || 0)),
        actual_duration_sec: Math.round(Number(payload.actual_duration_sec || 0)),
        status: payload.status || 'completed',
        started_at: payload.started_at || new Date().toISOString(),
        ended_at: payload.ended_at || new Date().toISOString(),
      };
      store.focus_sessions.unshift(session);
      if (session.mode === 'focus' || session.mode === 'custom') {
        pushActivity(store, 'focus_session', session.id, 'focus_logged', {
          task_title: task?.title || 'General Focus',
          minutes: Math.max(1, Math.round(session.actual_duration_sec / 60)),
          status: session.status,
        });
      }
      writeStore(store);
      return { ...session, task_label: task?.title || 'General Focus' };
    },
  },

  calendar: {
    async getRange(start, end) {
      const store = readStore();
      const today = getTodayIso();
      const next14 = addDaysIso(today, 14);
      const enriched = enrichTasks(store, store.tasks);
      return {
        tasks: enriched.filter(
          (t) =>
            (t.due_date && t.due_date >= start && t.due_date <= end) ||
            (t.start_date && t.due_date && t.start_date <= end && t.due_date >= start)
        ),
        sprints: store.sprints
          .filter((s) => s.status !== 'archived' && s.start_date <= end && s.end_date >= start)
          .sort((a, b) => a.start_date.localeCompare(b.start_date)),
        upcoming_tasks: enriched
          .filter((t) => t.semantic_type !== 'done' && t.due_date && t.due_date >= today && t.due_date <= next14)
          .sort((a, b) => a.due_date.localeCompare(b.due_date)),
      };
    },
  },

  analytics: {
    async getReport(range = '7d') {
      const store = readStore();
      const today = getTodayIso();
      const dayCount = range === '90d' ? 90 : range === '30d' ? 30 : 7;
      const startIso = addDaysIso(today, -(dayCount - 1));
      const days = dateRangeDays(startIso, today);
      const enriched = enrichTasks(store, store.tasks);

      const totalTasks = enriched.length;
      const completedTasks = enriched.filter((t) => t.semantic_type === 'done').length;
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const semanticCounts = { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 };
      enriched.forEach((t) => {
        if (semanticCounts[t.semantic_type] !== undefined) semanticCounts[t.semantic_type] += 1;
      });

      const focusRows = store.focus_sessions.filter((fs) => fs.mode === 'focus' || fs.mode === 'custom');
      const dayMap = new Map(
        days.map((d) => [d, { date: d, label: d.slice(5), tasks_completed: 0, tasks_created: 0, focus_minutes: 0 }])
      );

      enriched.forEach((t) => {
        const cd = t.created_at.slice(0, 10);
        if (dayMap.has(cd)) dayMap.get(cd).tasks_created += 1;
        if (t.completed_at) {
          const compDay = t.completed_at.slice(0, 10);
          if (dayMap.has(compDay)) dayMap.get(compDay).tasks_completed += 1;
        }
      });

      let rangeFocusSec = 0;
      let completedSessions = 0;
      let interruptedSessions = 0;
      focusRows.forEach((fs) => {
        const d = fs.started_at.slice(0, 10);
        if (d >= startIso && d <= today) {
          rangeFocusSec += Number(fs.actual_duration_sec || 0);
          if (fs.status === 'completed') completedSessions += 1;
          else interruptedSessions += 1;
        }
        if (dayMap.has(d)) {
          dayMap.get(d).focus_minutes += Math.round(Number(fs.actual_duration_sec || 0) / 60);
        }
      });

      const weekStart = addDaysIso(today, -55);
      const weekly_productivity = [];
      for (let i = 0; i < 8; i += 1) {
        const bStart = addDaysIso(weekStart, i * 7);
        const bEnd = addDaysIso(bStart, 6);
        weekly_productivity.push({
          label: bStart.slice(5),
          tasks_completed: enriched.filter(
            (t) => t.completed_at && t.completed_at.slice(0, 10) >= bStart && t.completed_at.slice(0, 10) <= bEnd
          ).length,
          focus_minutes: Math.round(
            focusRows
              .filter((fs) => fs.started_at.slice(0, 10) >= bStart && fs.started_at.slice(0, 10) <= bEnd)
              .reduce((a, b) => a + Number(b.actual_duration_sec || 0), 0) / 60
          ),
        });
      }

      const [curYear, curMonth] = today.split('-').map(Number);
      const monthly_productivity = [];
      for (let offset = 5; offset >= 0; offset -= 1) {
        const dt = new Date(Date.UTC(curYear, curMonth - 1 - offset, 1));
        const ym = dt.toISOString().slice(0, 7);
        monthly_productivity.push({
          month: ym,
          tasks_completed: enriched.filter((t) => t.completed_at && t.completed_at.slice(0, 7) === ym).length,
          focus_minutes: Math.round(
            focusRows
              .filter((fs) => fs.started_at.slice(0, 7) === ym)
              .reduce((a, b) => a + Number(b.actual_duration_sec || 0), 0) / 60
          ),
        });
      }

      const sprint_rates = store.sprints
        .filter((s) => s.status !== 'planned')
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
        .slice(0, 10)
        .map((sp) => {
          const stats = computeSprintStats(store, sp.id);
          return { ...sp, ...stats, completion_rate: stats.progress_percent };
        });

      const totalSes = completedSessions + interruptedSessions;
      return {
        range,
        start_date: startIso,
        end_date: today,
        summary: {
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          pending_tasks: totalTasks - completedTasks,
          completion_rate: completionRate,
          range_focus_sec: rangeFocusSec,
          completed_focus_sessions: completedSessions,
          interrupted_focus_sessions: interruptedSessions,
          avg_session_min: totalSes > 0 ? Math.round(rangeFocusSec / 60 / totalSes) : 0,
        },
        status_breakdown: [
          { key: 'backlog', label: 'Backlog', count: semanticCounts.backlog },
          { key: 'todo', label: 'To Do', count: semanticCounts.todo },
          { key: 'in_progress', label: 'In Progress', count: semanticCounts.in_progress },
          { key: 'review', label: 'Review', count: semanticCounts.review },
          { key: 'done', label: 'Done', count: semanticCounts.done },
        ],
        daily_trend: Array.from(dayMap.values()),
        weekly_productivity,
        monthly_productivity,
        sprint_rates,
      };
    },
  },

  settings: {
    async get() {
      return readStore().settings;
    },
    async update(payload) {
      const store = readStore();
      const next = { ...store.settings, ...payload, updated_at: new Date().toISOString() };
      if (next.pomodoro_focus_min < 1 || next.pomodoro_focus_min > 180) {
        throw new Error('Focus duration must be between 1 and 180 minutes.');
      }
      if (next.default_reminder_days !== undefined) {
        const rd = Math.round(Number(next.default_reminder_days));
        if (!Number.isFinite(rd) || rd < 0 || rd > 60) {
          throw new Error('Default reminder days must be between 0 and 60.');
        }
        next.default_reminder_days = rd;
      }
      store.settings = next;
      writeStore(store);
      return next;
    },
    async exportJson() {
      const store = readStore();
      return {
        exported_at: new Date().toISOString(),
        app: 'TASKLY',
        storage_mode: 'localStorage',
        profile: store.profile,
        settings: store.settings,
        kanban_columns: store.columns,
        categories: store.categories,
        labels: store.labels,
        sprints: store.sprints,
        tasks: enrichTasks(store, store.tasks),
        focus_sessions: store.focus_sessions,
        vault: vaultService.getSnapshot(),
      };
    },
    async exportCsv() {
      const store = readStore();
      const tasks = enrichTasks(store, store.tasks);
      const headers = ['ID', 'Title', 'Status Column', 'Priority', 'Category', 'Sprint', 'Start Date', 'Due Date', 'Reminder (Days Before)', 'Completed Subtasks', 'Total Subtasks', 'Completed At', 'Created At'];
      const lines = [headers.map(csvCell).join(',')];
      tasks.forEach((t) => {
        lines.push(
          [
            t.id,
            t.title,
            t.column_name,
            t.priority,
            t.category_name || '',
            t.sprint_name || '',
            t.start_date || '',
            t.due_date || '',
            t.reminder_days_before ?? '',
            t.subtasks.filter((s) => s.is_completed).length,
            t.subtasks.length,
            t.completed_at || '',
            t.created_at,
          ]
            .map(csvCell)
            .join(',')
        );
      });
      return lines.join('\n');
    },
    async resetWorkspace() {
      const fresh = createInitialStore();
      writeStore(fresh);
      vaultService.resetVault();
      return { ok: true };
    },
    async seedSampleWorkspace() {
      const store = readStore();
      if (store.tasks.length > 0) {
        throw new Error('Sample project can only be loaded into an empty workspace.');
      }
      const today = getTodayIso();
      const now = new Date().toISOString();
      const colBySem = Object.fromEntries(store.columns.map((c) => [c.semantic_type, c.id]));

      const catProduct = { id: createId(), name: 'Product', color_token: 'accent', created_at: now };
      const catEng = { id: createId(), name: 'Engineering', color_token: 'secondary', created_at: now };
      const catDesign = { id: createId(), name: 'Design', color_token: 'warning', created_at: now };
      store.categories.push(catProduct, catEng, catDesign);

      const lblCore = { id: createId(), name: 'Core', color_token: 'accent', created_at: now };
      const lblUx = { id: createId(), name: 'UI/UX', color_token: 'secondary', created_at: now };
      store.labels.push(lblCore, lblUx);

      const spActive = {
        id: createId(),
        name: 'Sprint 01 (Sample): Core Workflow Release',
        description: 'Optional sample data for exploring TASKLY features.',
        goal: 'Finish Kanban board flow, form validation, and first focus session.',
        start_date: addDaysIso(today, -3),
        end_date: addDaysIso(today, 4),
        status: 'active',
        completed_at: null,
        created_at: now,
        updated_at: now,
      };
      const spPlanned = {
        id: createId(),
        name: 'Sprint 02 (Sample): Analytics Enhancement',
        description: 'Follow-up cycle for calendar review and data export.',
        goal: 'Ensure weekly calendar consistency and productivity reports.',
        start_date: addDaysIso(today, 5),
        end_date: addDaysIso(today, 12),
        status: 'planned',
        completed_at: null,
        created_at: now,
        updated_at: now,
      };
      store.sprints.push(spActive, spPlanned);

      const samples = [
        {
          title: 'Finalize Light Workspace color token architecture',
          description: 'Verify minimum 4.5:1 contrast ratio across Light Workspace and Monochrome.',
          column_id: colBySem.done,
          category_id: catDesign.id,
          sprint_id: spActive.id,
          priority: 'high',
          start_date: addDaysIso(today, -3),
          due_date: addDaysIso(today, -1),
          completed_at: addDaysIso(today, -1) + 'T10:00:00.000Z',
          label_ids: [lblUx.id],
          subtasks: [
            { title: 'Check text contrast at #1A1A1A', is_completed: true },
            { title: 'Check button contrast #6B4A2E on white', is_completed: true },
          ],
        },
        {
          title: 'Implement Kanban drag-and-drop and mobile status sheet',
          description: 'Ensure smooth board interaction on desktop and 44px touch targets on mobile.',
          column_id: colBySem.in_progress,
          category_id: catEng.id,
          sprint_id: spActive.id,
          priority: 'urgent',
          start_date: addDaysIso(today, -1),
          due_date: today,
          completed_at: null,
          label_ids: [lblCore.id, lblUx.id],
          subtasks: [
            { title: 'Configure pointer and keyboard sensors', is_completed: true },
            { title: 'Test column tab switcher at 375px', is_completed: false },
          ],
        },
        {
          title: 'Review sprint completion flow and task carry-over',
          description: 'Provide options to move remaining tasks to Backlog or the next Sprint.',
          column_id: colBySem.review,
          category_id: catProduct.id,
          sprint_id: spActive.id,
          priority: 'high',
          start_date: today,
          due_date: addDaysIso(today, 2),
          completed_at: null,
          label_ids: [lblCore.id],
          subtasks: [],
        },
        {
          title: 'Test 25-minute Pomodoro session in Focus Mode',
          description: 'Verify timer accuracy when switching browser tabs.',
          column_id: colBySem.todo,
          category_id: catEng.id,
          sprint_id: spActive.id,
          priority: 'medium',
          start_date: today,
          due_date: addDaysIso(today, 3),
          completed_at: null,
          label_ids: [lblCore.id],
          subtasks: [],
        },
        {
          title: 'Design weekly report CSV export structure',
          description: 'Prepare status, due date, and subtask count columns.',
          column_id: colBySem.backlog,
          category_id: catProduct.id,
          sprint_id: spPlanned.id,
          priority: 'low',
          start_date: addDaysIso(today, 5),
          due_date: addDaysIso(today, 9),
          completed_at: null,
          label_ids: [],
          subtasks: [],
        },
      ];

      samples.forEach((item, idx) => {
        const tid = createId();
        store.tasks.push({
          id: tid,
          column_id: item.column_id,
          category_id: item.category_id,
          sprint_id: item.sprint_id,
          assignee_id: store.profile.id,
          title: item.title,
          description: item.description,
          priority: item.priority,
          start_date: item.start_date,
          due_date: item.due_date,
          position_in_column: (idx + 1) * 1000,
          label_ids: item.label_ids,
          completed_at: item.completed_at,
          created_at: addDaysIso(today, -3) + 'T08:00:00.000Z',
          updated_at: now,
        });
        item.subtasks.forEach((st, sIdx) => {
          store.subtasks.push({
            id: createId(),
            task_id: tid,
            title: st.title,
            is_completed: st.is_completed,
            position: sIdx,
            created_at: now,
          });
        });
        if (item.sprint_id) {
          store.sprint_tasks.push({
            id: createId(),
            sprint_id: item.sprint_id,
            task_id: tid,
            added_at: addDaysIso(today, -3) + 'T08:00:00.000Z',
            removed_at: null,
          });
        }
        if (idx === 1) {
          store.focus_sessions.push({
            id: createId(),
            task_id: tid,
            mode: 'focus',
            planned_duration_sec: 1500,
            actual_duration_sec: 1500,
            status: 'completed',
            started_at: today + 'T09:00:00.000Z',
            ended_at: today + 'T09:25:00.000Z',
          });
        }
      });

      pushActivity(store, 'sprint', spActive.id, 'sprint_started', { name: spActive.name });
      writeStore(store);
      return { message: 'Sample project loaded into localStorage.' };
    },
  },
};
