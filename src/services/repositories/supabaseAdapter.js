import { addDaysIso, dateRangeDays, getTodayIso } from '../../utils/dateUtils.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client = null;
async function getSupabase() {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

async function getCurrentUserId() {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error('Sesi pengguna Supabase tidak ditemukan.');
  return data.user.id;
}

export const supabaseAdapter = {
  mode: 'supabase',

  auth: {
    getToken: () => (isSupabaseConfigured ? 'supabase-session' : null),
    setToken: () => {},
    async register({ email, password, fullName }) {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw new Error(error.message);
      return { user: data.user, token: data.session?.access_token || null };
    },
    async login({ email, password }) {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return { user: data.user, token: data.session?.access_token };
    },
    async forgotPassword(email) {
      const sb = await getSupabase();
      const { error } = await sb.auth.resetPasswordForEmail(email);
      if (error) throw new Error(error.message);
      return { message: 'Tautan pemulihan kata sandi telah dikirim ke email Anda.' };
    },
    async resetPassword() {
      throw new Error('Gunakan tautan pemulihan yang dikirim ke email Anda.');
    },
    async logout() {
      const sb = await getSupabase();
      await sb.auth.signOut();
    },
    async me() {
      const sb = await getSupabase();
      const { data: authData, error } = await sb.auth.getUser();
      if (error || !authData?.user) throw new Error('Sesi tidak valid.');
      const { data: profile } = await sb.from('users').select('*').eq('id', authData.user.id).single();
      const { data: settings } = await sb.from('user_settings').select('*').eq('user_id', authData.user.id).single();
      return {
        user: profile || {
          id: authData.user.id,
          email: authData.user.email,
          full_name: authData.user.user_metadata?.full_name || authData.user.email,
        },
        settings,
      };
    },
    async updateProfile(fullName) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { data, error } = await sb.from('users').update({ full_name: fullName }).eq('id', uid).select().single();
      if (error) throw new Error(error.message);
      return { user: data };
    },
    async changePassword({ newPassword }) {
      const sb = await getSupabase();
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      return { message: 'Kata sandi diperbarui.' };
    },
    async deleteAccount() {
      throw new Error('Penghapusan akun Supabase memerlukan Edge Function admin.');
    },
  },

  columns: {
    async list() {
      const sb = await getSupabase();
      const { data, error } = await sb.from('kanban_columns').select('*').order('position', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    },
    async create(payload) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const cols = await this.list();
      const { data, error } = await sb
        .from('kanban_columns')
        .insert({ ...payload, user_id: uid, position: cols.length, is_default: false })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    async update(id, payload) {
      const sb = await getSupabase();
      const { data, error } = await sb.from('kanban_columns').update(payload).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async reorder(columnIds) {
      const sb = await getSupabase();
      await Promise.all(columnIds.map((id, idx) => sb.from('kanban_columns').update({ position: idx }).eq('id', id)));
      return this.list();
    },
    async remove(id, targetColumnId) {
      const sb = await getSupabase();
      if (targetColumnId) {
        await sb.from('tasks').update({ column_id: targetColumnId }).eq('column_id', id);
      }
      const { error } = await sb.from('kanban_columns').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { deletedId: id };
    },
  },

  taxonomy: {
    async listCategories() {
      const sb = await getSupabase();
      const { data, error } = await sb.from('task_categories').select('*').order('name');
      if (error) throw new Error(error.message);
      return data;
    },
    async createCategory(payload) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { data, error } = await sb.from('task_categories').insert({ ...payload, user_id: uid }).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async updateCategory(id, payload) {
      const sb = await getSupabase();
      const { data, error } = await sb.from('task_categories').update(payload).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async deleteCategory(id) {
      const sb = await getSupabase();
      const { error } = await sb.from('task_categories').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { deletedId: id };
    },
    async listLabels() {
      const sb = await getSupabase();
      const { data, error } = await sb.from('task_labels').select('*').order('name');
      if (error) throw new Error(error.message);
      return data;
    },
    async createLabel(payload) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { data, error } = await sb.from('task_labels').insert({ ...payload, user_id: uid }).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async deleteLabel(id) {
      const sb = await getSupabase();
      const { error } = await sb.from('task_labels').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { deletedId: id };
    },
  },

  tasks: {
    async list() {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('tasks')
        .select('*, kanban_columns(name, semantic_type), task_categories(name, color_token), sprints(name, status), subtasks(*)')
        .order('position_in_column', { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []).map((t) => ({
        ...t,
        column_name: t.kanban_columns?.name,
        semantic_type: t.kanban_columns?.semantic_type,
        category_name: t.task_categories?.name || null,
        category_color: t.task_categories?.color_token || null,
        sprint_name: t.sprints?.name || null,
        labels: [],
        subtasks: t.subtasks || [],
      }));
    },
    async get(id) {
      const list = await this.list();
      return list.find((t) => t.id === id) || null;
    },
    async create(payload) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { label_ids, subtasks, ...rest } = payload;
      const { data, error } = await sb.from('tasks').insert({ ...rest, user_id: uid, assignee_id: uid }).select().single();
      if (error) throw new Error(error.message);
      if (Array.isArray(label_ids) && label_ids.length) {
        await sb.from('task_label_assignments').insert(label_ids.map((label_id) => ({ task_id: data.id, label_id })));
      }
      if (Array.isArray(subtasks) && subtasks.length) {
        await sb.from('subtasks').insert(subtasks.map((s, idx) => ({ task_id: data.id, title: s.title, position: idx })));
      }
      return this.get(data.id);
    },
    async update(id, payload) {
      const sb = await getSupabase();
      const { label_ids, ...rest } = payload;
      const { error } = await sb.from('tasks').update(rest).eq('id', id);
      if (error) throw new Error(error.message);
      if (Array.isArray(label_ids)) {
        await sb.from('task_label_assignments').delete().eq('task_id', id);
        if (label_ids.length) {
          await sb.from('task_label_assignments').insert(label_ids.map((label_id) => ({ task_id: id, label_id })));
        }
      }
      return this.get(id);
    },
    async bulk({ taskIds, action, columnId, priority, sprintId }) {
      const sb = await getSupabase();
      if (action === 'delete') await sb.from('tasks').delete().in('id', taskIds);
      if (action === 'move_column') await sb.from('tasks').update({ column_id: columnId }).in('id', taskIds);
      if (action === 'set_priority') await sb.from('tasks').update({ priority }).in('id', taskIds);
      if (action === 'assign_sprint') await sb.from('tasks').update({ sprint_id: sprintId }).in('id', taskIds);
      return { updatedCount: taskIds.length };
    },
    async remove(id) {
      const sb = await getSupabase();
      const { error } = await sb.from('tasks').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { deletedId: id };
    },
    async addSubtask(taskId, title) {
      const sb = await getSupabase();
      const { data, error } = await sb.from('subtasks').insert({ task_id: taskId, title }).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async updateSubtask(taskId, subtaskId, payload) {
      const sb = await getSupabase();
      const { data, error } = await sb.from('subtasks').update(payload).eq('id', subtaskId).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async removeSubtask(taskId, subtaskId) {
      const sb = await getSupabase();
      const { error } = await sb.from('subtasks').delete().eq('id', subtaskId);
      if (error) throw new Error(error.message);
      return { deletedId: subtaskId };
    },
  },

  sprints: {
    async list() {
      const sb = await getSupabase();
      const { data: sprints, error } = await sb.from('sprints').select('*').order('start_date', { ascending: false });
      if (error) throw new Error(error.message);
      const tasks = await supabaseAdapter.tasks.list();
      return (sprints || []).map((sp) => {
        const st = tasks.filter((t) => t.sprint_id === sp.id);
        const completed = st.filter((t) => t.semantic_type === 'done').length;
        return {
          ...sp,
          total_tasks: st.length,
          completed_tasks: completed,
          remaining_tasks: Math.max(0, st.length - completed),
          progress_percent: st.length ? Math.round((completed / st.length) * 100) : 0,
        };
      });
    },
    async detail(id) {
      const sb = await getSupabase();
      const { data: sp, error } = await sb.from('sprints').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      const allTasks = await supabaseAdapter.tasks.list();
      const tasks = allTasks.filter((t) => t.sprint_id === id);
      const completed = tasks.filter((t) => t.semantic_type === 'done').length;
      const days = dateRangeDays(sp.start_date, sp.end_date);
      const today = getTodayIso();
      const burndown = days.map((d, i) => ({
        day: i + 1,
        date: d,
        label: d.slice(5),
        ideal_remaining: Number((tasks.length * (1 - i / Math.max(1, days.length - 1))).toFixed(1)),
        actual_remaining: d <= today ? tasks.filter((t) => !t.completed_at || t.completed_at.slice(0, 10) > d).length : null,
      }));
      return {
        sprint: {
          ...sp,
          total_tasks: tasks.length,
          completed_tasks: completed,
          remaining_tasks: Math.max(0, tasks.length - completed),
          progress_percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
        },
        tasks,
        burndown,
      };
    },
    async create(payload) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { taskIds, ...rest } = payload;
      const { data, error } = await sb.from('sprints').insert({ ...rest, user_id: uid }).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async update(id, payload) {
      const sb = await getSupabase();
      const { data, error } = await sb.from('sprints').update(payload).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async start(id) {
      return this.update(id, { status: 'active' });
    },
    async complete(id, { carryoverAction, targetSprintId }) {
      const sb = await getSupabase();
      await sb.from('tasks').update({ sprint_id: carryoverAction === 'sprint' ? targetSprintId : null }).eq('sprint_id', id).is('completed_at', null);
      return this.update(id, { status: 'completed', completed_at: new Date().toISOString() });
    },
    async assignTask(sprintId, taskId, action = 'add') {
      return supabaseAdapter.tasks.update(taskId, { sprint_id: action === 'remove' ? null : sprintId });
    },
    async remove(id) {
      const sb = await getSupabase();
      await sb.from('tasks').update({ sprint_id: null }).eq('sprint_id', id);
      const { error } = await sb.from('sprints').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { deletedId: id };
    },
  },

  focus: {
    async listSessions(limit = 30) {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('focus_sessions')
        .select('*, tasks(title)')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((s) => ({ ...s, task_label: s.tasks?.title || 'Fokus Umum' }));
    },
    async getStats() {
      const sessions = await this.listSessions(200);
      const today = getTodayIso();
      const todayFocus = sessions.filter((s) => (s.mode === 'focus' || s.mode === 'custom') && s.started_at.slice(0, 10) === today);
      return {
        today_completed_sessions: todayFocus.filter((s) => s.status === 'completed').length,
        today_focus_sec: todayFocus.reduce((a, b) => a + b.actual_duration_sec, 0),
        total_sessions: sessions.length,
        total_focus_sec: sessions.reduce((a, b) => a + b.actual_duration_sec, 0),
      };
    },
    async logSession(payload) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { data, error } = await sb.from('focus_sessions').insert({ ...payload, user_id: uid }).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
  },

  dashboard: {
    async getSummary() {
      const today = getTodayIso();
      const [tasks, sprints, focusStats] = await Promise.all([
        supabaseAdapter.tasks.list(),
        supabaseAdapter.sprints.list(),
        supabaseAdapter.focus.getStats(),
      ]);
      return {
        today,
        counts: {
          total: tasks.length,
          completed: tasks.filter((t) => t.semantic_type === 'done').length,
          in_progress: tasks.filter((t) => t.semantic_type === 'in_progress' || t.semantic_type === 'review').length,
          overdue: tasks.filter((t) => t.due_date && t.due_date < today && t.semantic_type !== 'done').length,
        },
        active_sprint: sprints.find((s) => s.status === 'active') || null,
        upcoming_deadlines: tasks.filter((t) => t.semantic_type !== 'done').slice(0, 8),
        daily_overview: {
          completed_today: tasks.filter((t) => t.completed_at && t.completed_at.slice(0, 10) === today).length,
          focus_sec_today: focusStats.today_focus_sec,
          focus_sessions_today: focusStats.today_completed_sessions,
        },
        recent_activities: [],
      };
    },
  },

  calendar: {
    async getRange(start, end) {
      const [tasks, sprints] = await Promise.all([supabaseAdapter.tasks.list(), supabaseAdapter.sprints.list()]);
      return {
        tasks: tasks.filter((t) => t.due_date && t.due_date >= start && t.due_date <= end),
        sprints: sprints.filter((s) => s.start_date <= end && s.end_date >= start && s.status !== 'archived'),
        upcoming_tasks: tasks.filter((t) => t.semantic_type !== 'done' && t.due_date && t.due_date >= getTodayIso()),
      };
    },
  },

  analytics: {
    async getReport(range = '7d') {
      const today = getTodayIso();
      const daysCount = range === '90d' ? 90 : range === '30d' ? 30 : 7;
      const start = addDaysIso(today, -(daysCount - 1));
      const [tasks, sprints, sessions] = await Promise.all([
        supabaseAdapter.tasks.list(),
        supabaseAdapter.sprints.list(),
        supabaseAdapter.focus.listSessions(200),
      ]);
      const done = tasks.filter((t) => t.semantic_type === 'done').length;
      const days = dateRangeDays(start, today);
      return {
        range,
        start_date: start,
        end_date: today,
        summary: {
          total_tasks: tasks.length,
          completed_tasks: done,
          pending_tasks: tasks.length - done,
          completion_rate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
          range_focus_sec: sessions.reduce((a, b) => a + b.actual_duration_sec, 0),
          completed_focus_sessions: sessions.filter((s) => s.status === 'completed').length,
          interrupted_focus_sessions: sessions.filter((s) => s.status === 'interrupted').length,
          avg_session_min: sessions.length
            ? Math.round(sessions.reduce((a, b) => a + b.actual_duration_sec, 0) / 60 / sessions.length)
            : 0,
        },
        status_breakdown: ['backlog', 'todo', 'in_progress', 'review', 'done'].map((k) => ({
          key: k,
          label: k,
          count: tasks.filter((t) => t.semantic_type === k).length,
        })),
        daily_trend: days.map((d) => ({
          date: d,
          label: d.slice(5),
          tasks_completed: tasks.filter((t) => t.completed_at?.slice(0, 10) === d).length,
          focus_minutes: Math.round(
            sessions.filter((s) => s.started_at.slice(0, 10) === d).reduce((a, b) => a + b.actual_duration_sec, 0) / 60
          ),
        })),
        weekly_productivity: [],
        monthly_productivity: [],
        sprint_rates: sprints.filter((s) => s.status !== 'planned').map((s) => ({
          ...s,
          completion_rate: s.progress_percent,
        })),
      };
    },
  },

  settings: {
    async get() {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { data } = await sb.from('user_settings').select('*').eq('user_id', uid).single();
      return data;
    },
    async update(payload) {
      const sb = await getSupabase();
      const uid = await getCurrentUserId();
      const { data, error } = await sb.from('user_settings').update(payload).eq('user_id', uid).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async exportJson() {
      const [tasks, sprints, sessions] = await Promise.all([
        supabaseAdapter.tasks.list(),
        supabaseAdapter.sprints.list(),
        supabaseAdapter.focus.listSessions(500),
      ]);
      return { exported_at: new Date().toISOString(), app: 'TASKLY', tasks, sprints, focus_sessions: sessions };
    },
    async exportCsv() {
      const tasks = await supabaseAdapter.tasks.list();
      return ['Judul,Status,Prioritas,Tenggat', ...tasks.map((t) => `"${t.title}",${t.column_name},${t.priority},${t.due_date || ''}`)].join('\n');
    },
    async seedSampleWorkspace() {
      throw new Error('Gunakan pembuatan tugas & sprint langsung pada workspace Supabase.');
    },
  },
};
