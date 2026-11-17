import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Timer, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from '../../components/ui/Modal.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { useUiStore } from '../../stores/useUiStore.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { repo } from '../../services/repositories/index.js';
import { formatRelativeDateTime } from '../../utils/dateUtils.js';

export function TaskDetailDrawer() {
  const activeTaskId = useUiStore((s) => s.activeTaskId);
  const closeTaskDrawer = useUiStore((s) => s.closeTaskDrawer);
  const selectTimerTask = useTimerStore((s) => s.selectTask);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnId, setColumnId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [categoryId, setCategoryId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [dateError, setDateError] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const {
    data: task,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => repo.tasks.get(activeTaskId),
    enabled: Boolean(activeTaskId),
  });

  const { data: columns = [] } = useQuery({
    queryKey: ['columns'],
    queryFn: () => repo.columns.list(),
    enabled: Boolean(activeTaskId),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => repo.taxonomy.listCategories(),
    enabled: Boolean(activeTaskId),
  });

  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => repo.taxonomy.listLabels(),
    enabled: Boolean(activeTaskId),
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints'],
    queryFn: () => repo.sprints.list(),
    enabled: Boolean(activeTaskId),
  });

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setColumnId(task.column_id || '');
      setPriority(task.priority || 'medium');
      setCategoryId(task.category_id || '');
      setSprintId(task.sprint_id || '');
      setStartDate(task.start_date || '');
      setDueDate(task.due_date || '');
      setSelectedLabelIds((task.labels || []).map((l) => l.id));
      setDateError('');
    }
  }, [task]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['task', activeTaskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['sprints'] });
    queryClient.invalidateQueries({ queryKey: ['sprint'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  }

  const updateMutation = useMutation({
    mutationFn: (payload) => repo.tasks.update(activeTaskId, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success('Perubahan tugas disimpan.');
    },
    onError: (err) => toast.error(err.message || 'Gagal menyimpan perubahan.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => repo.tasks.remove(activeTaskId),
    onSuccess: () => {
      invalidateAll();
      setConfirmDeleteOpen(false);
      closeTaskDrawer();
      toast.success('Tugas dihapus.');
    },
    onError: (err) => toast.error(err.message || 'Gagal menghapus tugas.'),
  });

  const addSubtaskMutation = useMutation({
    mutationFn: (subTitle) => repo.tasks.addSubtask(activeTaskId, subTitle),
    onSuccess: () => {
      setNewSubtaskTitle('');
      invalidateAll();
    },
    onError: (err) => toast.error(err.message || 'Gagal menambah subtask.'),
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: ({ subId, nextState }) =>
      repo.tasks.updateSubtask(activeTaskId, subId, { is_completed: nextState }),
    onSuccess: () => invalidateAll(),
  });

  const removeSubtaskMutation = useMutation({
    mutationFn: (subId) => repo.tasks.removeSubtask(activeTaskId, subId),
    onSuccess: () => invalidateAll(),
  });

  const createLabelMutation = useMutation({
    mutationFn: (name) => repo.taxonomy.createLabel({ name, color_token: 'secondary' }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setNewLabelName('');
      const nextIds = [...selectedLabelIds, created.id];
      setSelectedLabelIds(nextIds);
      updateMutation.mutate({ label_ids: nextIds });
    },
    onError: (err) => toast.error(err.message || 'Gagal membuat label.'),
  });

  function handleSaveDetails(e) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Judul tugas tidak boleh kosong.');
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      setDateError('Tanggal mulai tidak boleh melewati tenggat waktu.');
      return;
    }
    setDateError('');
    updateMutation.mutate({
      title: title.trim(),
      description,
      column_id: columnId,
      priority,
      category_id: categoryId || null,
      sprint_id: sprintId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      label_ids: selectedLabelIds,
    });
  }

  function handleToggleLabel(labelId) {
    const exists = selectedLabelIds.includes(labelId);
    const next = exists ? selectedLabelIds.filter((id) => id !== labelId) : [...selectedLabelIds, labelId];
    setSelectedLabelIds(next);
  }

  function handleFocusThisTask() {
    if (!task) return;
    selectTimerTask(task.id, task.title);
    closeTaskDrawer();
    navigate('/focus');
  }

  const completedSubtasks = (task?.subtasks || []).filter((s) => s.is_completed).length;
  const totalSubtasks = (task?.subtasks || []).length;

  return (
    <>
      <Drawer
        open={Boolean(activeTaskId)}
        onClose={closeTaskDrawer}
        title={task?.title || 'Detail Tugas'}
        subtitle={task ? `Kolom: ${task.column_name}` : undefined}
      >
        {isLoading && <LoadingState label="Memuat detail tugas..." rows={4} />}
        {isError && <ErrorState message={error?.message} onRetry={refetch} />}

        {task && !isLoading && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" size="sm" onClick={handleFocusThisTask}>
                <Timer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Fokus ke Tugas Ini</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Hapus Tugas</span>
              </Button>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-4">
              <Input
                label="Judul Tugas"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />

              <Textarea
                label="Deskripsi"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tambahkan konteks pekerjaan atau kriteria selesai..."
                rows={3}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Dropdown
                  label="Status Kolom"
                  value={columnId}
                  onChange={setColumnId}
                  options={columns.map((c) => ({ value: c.id, label: c.name }))}
                />

                <Dropdown
                  label="Prioritas"
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                    { value: 'urgent', label: 'Urgent' },
                  ]}
                />

                <Dropdown
                  label="Kategori"
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[
                    { value: '', label: 'Tanpa kategori' },
                    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                  ]}
                />

                <Dropdown
                  label="Sprint Assignment"
                  value={sprintId}
                  onChange={setSprintId}
                  options={[
                    { value: '', label: 'Backlog (Tanpa Sprint)' },
                    ...sprints.map((sp) => ({ value: sp.id, label: sp.name, hint: sp.status })),
                  ]}
                />

                <Input
                  label="Tanggal Mulai"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />

                <Input
                  label="Tenggat Waktu (Due Date)"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  error={dateError}
                />
              </div>

              {/* Labels multi-select */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">Label</p>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((lb) => {
                    const active = selectedLabelIds.includes(lb.id);
                    return (
                      <button
                        key={lb.id}
                        type="button"
                        onClick={() => handleToggleLabel(lb.id)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)] text-[var(--color-accent-text)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'
                        }`}
                      >
                        {active && <Check className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />}
                        <span>{lb.name}</span>
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      aria-label="Buat label baru"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      placeholder="+ Label baru"
                      className="h-7 w-28 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                    />
                    {newLabelName.trim() && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => createLabelMutation.mutate(newLabelName.trim())}
                      >
                        Tambah
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Assignee (Multi-User Schema Ready) */}
              <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <User className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Assignee (Workspace Pribadi)
                </span>
                <span className="font-medium text-[var(--color-text-primary)]">{user?.full_name || 'Pemilik Akun'}</span>
              </div>

              <Button type="submit" isLoading={updateMutation.isPending} className="w-full sm:w-auto">
                Simpan Perubahan
              </Button>
            </form>

            {/* Subtasks / Checklist */}
            <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Checklist / Subtasks</h3>
                <span className="font-mono-num text-xs text-[var(--color-text-secondary)]">
                  {completedSubtasks}/{totalSubtasks} selesai
                </span>
              </div>

              <div className="space-y-1.5">
                {(task.subtasks || []).map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(st.is_completed)}
                        onChange={(e) =>
                          toggleSubtaskMutation.mutate({ subId: st.id, nextState: e.target.checked })
                        }
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      <span
                        className={`truncate ${
                          st.is_completed ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'
                        }`}
                      >
                        {st.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSubtaskMutation.mutate(st.id)}
                      aria-label={`Hapus subtask ${st.title}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSubtaskTitle.trim()) return;
                  addSubtaskMutation.mutate(newSubtaskTitle.trim());
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  aria-label="Tambah langkah subtask baru"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Tambah langkah subtask..."
                  className="min-h-[40px] flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                />
                <Button type="submit" variant="secondary" isLoading={addSubtaskMutation.isPending}>
                  <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>Tambah</span>
                </Button>
              </form>
            </div>

            {/* Metadata Timestamps */}
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
              <div>
                <p className="font-medium text-[var(--color-text-secondary)]">Dibuat Pada</p>
                <p className="mt-0.5">{formatRelativeDateTime(task.created_at)}</p>
              </div>
              <div>
                <p className="font-medium text-[var(--color-text-secondary)]">Terakhir Diperbarui</p>
                <p className="mt-0.5">{formatRelativeDateTime(task.updated_at)}</p>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
        title="Hapus Tugas Permanen?"
        description={`Tugas "${task?.title || ''}" beserta seluruh subtask di dalamnya akan dihapus permanen.`}
        confirmLabel="Ya, Hapus Tugas"
      />
    </>
  );
}
