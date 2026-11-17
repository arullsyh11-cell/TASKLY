import { apiRequest, getStoredToken, setStoredToken } from '../apiClient.js';
import { getTodayIso } from '../../utils/dateUtils.js';

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const apiAdapter = {
  mode: 'api',

  auth: {
    getToken: getStoredToken,
    setToken: setStoredToken,
    async register(payload) {
      const data = await apiRequest('/auth/register', { method: 'POST', body: payload, token: null });
      setStoredToken(data.token);
      return data;
    },
    async login(payload) {
      const data = await apiRequest('/auth/login', { method: 'POST', body: payload, token: null });
      setStoredToken(data.token);
      return data;
    },
    async forgotPassword(email) {
      return apiRequest('/auth/forgot-password', { method: 'POST', body: { email }, token: null });
    },
    async resetPassword(payload) {
      return apiRequest('/auth/reset-password', { method: 'POST', body: payload, token: null });
    },
    async logout() {
      setStoredToken(null);
    },
    async me() {
      return apiRequest('/auth/me');
    },
    async updateProfile(fullName) {
      return apiRequest('/auth/profile', { method: 'PATCH', body: { fullName } });
    },
    async changePassword(payload) {
      return apiRequest('/auth/change-password', { method: 'POST', body: payload });
    },
    async deleteAccount() {
      const data = await apiRequest('/auth/account', { method: 'DELETE' });
      setStoredToken(null);
      return data;
    },
  },

  dashboard: {
    async getSummary() {
      return apiRequest(`/dashboard${qs({ today: getTodayIso() })}`);
    },
  },

  columns: {
    async list() {
      const data = await apiRequest('/columns');
      return data.columns;
    },
    async create(payload) {
      const data = await apiRequest('/columns', { method: 'POST', body: payload });
      return data.column;
    },
    async update(id, payload) {
      const data = await apiRequest(`/columns/${id}`, { method: 'PATCH', body: payload });
      return data.column;
    },
    async reorder(columnIds) {
      const data = await apiRequest('/columns/reorder', { method: 'PATCH', body: { columnIds } });
      return data.columns;
    },
    async remove(id, targetColumnId) {
      return apiRequest(`/columns/${id}`, {
        method: 'DELETE',
        body: targetColumnId ? { targetColumnId } : undefined,
      });
    },
  },

  taxonomy: {
    async listCategories() {
      const data = await apiRequest('/categories');
      return data.categories;
    },
    async createCategory(payload) {
      const data = await apiRequest('/categories', { method: 'POST', body: payload });
      return data.category;
    },
    async updateCategory(id, payload) {
      const data = await apiRequest(`/categories/${id}`, { method: 'PATCH', body: payload });
      return data.category;
    },
    async deleteCategory(id) {
      return apiRequest(`/categories/${id}`, { method: 'DELETE' });
    },
    async listLabels() {
      const data = await apiRequest('/labels');
      return data.labels;
    },
    async createLabel(payload) {
      const data = await apiRequest('/labels', { method: 'POST', body: payload });
      return data.label;
    },
    async deleteLabel(id) {
      return apiRequest(`/labels/${id}`, { method: 'DELETE' });
    },
  },

  tasks: {
    async list(filters = {}) {
      const data = await apiRequest(`/tasks${qs({ ...filters, today: getTodayIso() })}`);
      return data.tasks;
    },
    async get(id) {
      const data = await apiRequest(`/tasks/${id}`);
      return data.task;
    },
    async create(payload) {
      const data = await apiRequest('/tasks', { method: 'POST', body: payload });
      return data.task;
    },
    async update(id, payload) {
      const data = await apiRequest(`/tasks/${id}`, { method: 'PATCH', body: payload });
      return data.task;
    },
    async bulk(payload) {
      return apiRequest('/tasks/bulk', { method: 'PATCH', body: payload });
    },
    async remove(id) {
      return apiRequest(`/tasks/${id}`, { method: 'DELETE' });
    },
    async addSubtask(taskId, title) {
      const data = await apiRequest(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } });
      return data.subtask;
    },
    async updateSubtask(taskId, subtaskId, payload) {
      const data = await apiRequest(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'PATCH', body: payload });
      return data.subtask;
    },
    async removeSubtask(taskId, subtaskId) {
      return apiRequest(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
    },
  },

  sprints: {
    async list() {
      const data = await apiRequest('/sprints');
      return data.sprints;
    },
    async detail(id) {
      return apiRequest(`/sprints/${id}${qs({ today: getTodayIso() })}`);
    },
    async create(payload) {
      const data = await apiRequest('/sprints', { method: 'POST', body: payload });
      return data.sprint;
    },
    async update(id, payload) {
      const data = await apiRequest(`/sprints/${id}`, { method: 'PATCH', body: payload });
      return data.sprint;
    },
    async start(id, forceCompleteActive = false) {
      const data = await apiRequest(`/sprints/${id}/start`, {
        method: 'POST',
        body: { forceCompleteActive },
      });
      return data.sprint;
    },
    async complete(id, payload) {
      const data = await apiRequest(`/sprints/${id}/complete`, { method: 'POST', body: payload });
      return data.sprint;
    },
    async assignTask(sprintId, taskId, action = 'add') {
      return apiRequest(`/sprints/${sprintId}/tasks`, { method: 'POST', body: { taskId, action } });
    },
    async remove(id) {
      return apiRequest(`/sprints/${id}`, { method: 'DELETE' });
    },
  },

  focus: {
    async listSessions(limit = 30) {
      const data = await apiRequest(`/focus/sessions${qs({ limit })}`);
      return data.sessions;
    },
    async getStats() {
      return apiRequest(`/focus/stats${qs({ today: getTodayIso() })}`);
    },
    async logSession(payload) {
      const data = await apiRequest('/focus/sessions', { method: 'POST', body: payload });
      return data.session;
    },
  },

  calendar: {
    async getRange(start, end) {
      return apiRequest(`/calendar${qs({ start, end, today: getTodayIso() })}`);
    },
  },

  analytics: {
    async getReport(range = '7d') {
      return apiRequest(`/analytics${qs({ range, today: getTodayIso() })}`);
    },
  },

  settings: {
    async get() {
      const data = await apiRequest('/settings');
      return data.settings;
    },
    async update(payload) {
      const data = await apiRequest('/settings', { method: 'PATCH', body: payload });
      return data.settings;
    },
    async exportJson() {
      return apiRequest('/export/json');
    },
    async exportCsv() {
      return apiRequest('/export/csv', { raw: true });
    },
    async seedSampleWorkspace() {
      return apiRequest('/workspace/seed-sample', { method: 'POST', body: { today: getTodayIso() } });
    },
  },
};
