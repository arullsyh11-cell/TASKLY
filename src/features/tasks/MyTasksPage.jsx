import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Plus, Search, Timer, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { repo } from '../../services/repositories/index.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { OverdueTag, PriorityBadge, ReminderTag, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { formatDateId, isTaskOverdue } from '../../utils/dateUtils.js';
import { formatReminderBadgeLabel, resolveTaskReminderDays } from '../../utils/reminderUtils.js';

export function MyTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [semanticType, setSemanticType] = useState(searchParams.get('semanticType') || '');
  const [priority, setPriority] = useState(searchParams.get('priority') || '');
  const [categoryId, setCategoryId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [deadline, setDeadline] = useState(searchParams.get('deadline') || '');
  const [sort, setSort] = useState('due_date');
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);
  const selectTimerTask = useTimerStore((s) => s.selectTask);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const filters = useMemo(
    () => ({ search, semanticType, priority, categoryId, sprintId, deadline, sort }),
    [search, semanticType, priority, categoryId, sprintId, deadline, sort]
  );

  const { data: tasks = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => repo.tasks.list(filters),
  });

  const { data: columns = [] } = useQuery({
    queryKey: ['columns'],
    queryFn: () => repo.columns.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => repo.taxonomy.listCategories(),
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints'],
    queryFn: () => repo.sprints.list(),
  });

  function invalidateTasks() {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['sprints'] });
    queryClient.invalidateQueries({ queryKey: ['sprint'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  }

  const inlineUpdateMutation = useMutation({
    mutationFn: ({ id, patch }) => repo.tasks.update(id, patch),
    onSuccess: () => {
      invalidateTasks();
    },
    onError: (err) => toast.error(err.message || 'Gagal memperbarui tugas.'),
  });

  const bulkMutation = useMutation({
    mutationFn: (payload) => repo.tasks.bulk(payload),
    onSuccess: (res, vars) => {
      invalidateTasks();
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      toast.success(
        vars.action === 'delete'
          ? `${res.updatedCount} tugas dihapus.`
          : `${res.updatedCount} tugas berhasil diperbarui.`
      );
    },
    onError: (err) => toast.error(err.message || 'Aksi massal gagal dijalankan.'),
  });

  const hasActiveFilters = Boolean(search || semanticType || priority || categoryId || sprintId || deadline);

  function resetFilters() {
    setSearch('');
    setSemanticType('');
    setPriority('');
    setCategoryId('');
    setSprintId('');
    setDeadline('');
    setSearchParams({});
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    if (selectedIds.length === tasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(tasks.map((t) => t.id));
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">My Tasks</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Kelola seluruh daftar tugas, penyaringan prioritas, dan triase massal ke dalam sprint.
          </p>
        </div>
        <Button onClick={() => openQuickAdd()}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Tambah Tugas</span>
        </Button>
      </header>

      {/* Filter & Search Bar */}
      <section aria-label="Filter dan pencarian tugas" className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Cari tugas berdasarkan judul atau deskripsi"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul, deskripsi, atau label..."
              className="min-h-[42px] w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] pl-10 pr-4 text-base sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>

          <Dropdown
            aria-label="Filter tahap alur"
            value={semanticType}
            onChange={setSemanticType}
            options={[
              { value: '', label: 'Semua Status' },
              { value: 'backlog', label: 'Backlog' },
              { value: 'todo', label: 'To Do' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'review', label: 'Review' },
              { value: 'done', label: 'Done' },
            ]}
          />

          <Dropdown
            aria-label="Filter prioritas"
            value={priority}
            onChange={setPriority}
            options={[
              { value: '', label: 'Semua Prioritas' },
              { value: 'urgent', label: 'Urgent' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />

          <Dropdown
            aria-label="Filter sprint"
            value={sprintId}
            onChange={setSprintId}
            options={[
              { value: '', label: 'Semua Sprint' },
              { value: 'backlog', label: 'Tanpa Sprint (Backlog)' },
              ...sprints.map((sp) => ({ value: sp.id, label: sp.name })),
            ]}
          />

          <Dropdown
            aria-label="Urutkan daftar"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'due_date', label: 'Urut: Tenggat Terdekat' },
              { value: 'priority', label: 'Urut: Prioritas Tertinggi' },
              { value: 'updated_at', label: 'Urut: Baru Diperbarui' },
              { value: 'position', label: 'Urut: Posisi Board' },
            ]}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="w-full sm:w-44">
              <Dropdown
                compact
                aria-label="Filter kategori"
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: '', label: 'Semua Kategori' },
                  ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                ]}
              />
            </div>

            <div className="w-full sm:w-44">
              <Dropdown
                compact
                aria-label="Filter tenggat waktu"
                value={deadline}
                onChange={setDeadline}
                options={[
                  { value: '', label: 'Semua Tenggat' },
                  { value: 'overdue', label: 'Terlambat (Overdue)' },
                  { value: 'today', label: 'Jatuh Tempo Hari Ini' },
                  { value: 'week', label: '7 Hari ke Depan' },
                  { value: 'none', label: 'Tanpa Tenggat' },
                ]}
              />
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="col-span-2 sm:col-span-1 justify-self-start">
                <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Reset Filter</span>
              </Button>
            )}
          </div>

          <p className="font-mono-num text-xs text-[var(--color-text-muted)]">
            {tasks.length} tugas ditampilkan
          </p>
        </div>
      </section>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div
          role="region"
          aria-label="Aksi massal tugas terpilih"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] px-4 py-3"
        >
          <p className="text-xs font-semibold text-[var(--color-accent-text)]">
            {selectedIds.length} tugas dipilih
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Dropdown
                compact
                aria-label="Pindah kolom massal"
                placeholder="Pindah Status..."
                value=""
                onChange={(colId) => {
                  if (colId) bulkMutation.mutate({ taskIds: selectedIds, action: 'move_column', columnId: colId });
                }}
                options={columns.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>

            <div className="w-44">
              <Dropdown
                compact
                aria-label="Assign sprint massal"
                placeholder="Assign Sprint..."
                value=""
                onChange={(val) => {
                  if (val === '__backlog__') {
                    bulkMutation.mutate({ taskIds: selectedIds, action: 'assign_sprint', sprintId: null });
                  } else if (val) {
                    bulkMutation.mutate({ taskIds: selectedIds, action: 'assign_sprint', sprintId: val });
                  }
                }}
                options={[
                  { value: '__backlog__', label: 'Lepas ke Backlog' },
                  ...sprints
                    .filter((sp) => sp.status === 'active' || sp.status === 'planned')
                    .map((sp) => ({ value: sp.id, label: sp.name })),
                ]}
              />
            </div>

            <Button variant="danger" size="sm" onClick={() => setConfirmBulkDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>Hapus Terpilih</span>
            </Button>
          </div>
        </div>
      )}

      {/* List / Table Content */}
      {isLoading ? (
        <LoadingState label="Memuat daftar tugas..." rows={5} />
      ) : isError ? (
        <ErrorState title="Gagal memuat daftar tugas" message={error?.message} onRetry={refetch} />
      ) : tasks.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={Search}
            title="Tidak ada tugas yang cocok dengan filter"
            description="Ubah kata kunci pencarian atau reset filter untuk melihat seluruh tugas Anda."
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Reset Filter
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={CheckSquare}
            title="Belum ada tugas di workspace Anda"
            description="Tambahkan tugas pertama Anda untuk mulai mengelola status alur kerja, tenggat waktu, dan sprint."
            action={
              <Button onClick={() => openQuickAdd()}>
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Buat Tugas Pertama</span>
              </Button>
            }
          />
        )
      ) : (
        <>
          {/* Desktop Structured Table */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-xs font-semibold text-[var(--color-text-secondary)]">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua tugas"
                      checked={tasks.length > 0 && selectedIds.length === tasks.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                  </th>
                  <th className="px-3 py-3">Tugas</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Prioritas</th>
                  <th className="px-3 py-3">Sprint / Kategori</th>
                  <th className="px-3 py-3">Tenggat</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {tasks.map((task) => {
                  const overdue = isTaskOverdue(task.due_date, task.semantic_type);
                  const doneSub = (task.subtasks || []).filter((s) => s.is_completed).length;
                  const totSub = (task.subtasks || []).length;
                  return (
                    <tr key={task.id} className="hover:bg-[var(--color-bg)]/45">
                      <td className="px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Pilih tugas ${task.title}`}
                          checked={selectedIds.includes(task.id)}
                          onChange={() => toggleSelect(task.id)}
                          className="h-4 w-4 accent-[var(--color-primary)]"
                        />
                      </td>
                      <td className="max-w-md px-3 py-3">
                        <button
                          type="button"
                          onClick={() => openTaskDrawer(task.id)}
                          className={`text-left font-medium hover:text-[var(--color-accent-text)] hover:underline ${
                            task.semantic_type === 'done'
                              ? 'line-through text-[var(--color-text-muted)]'
                              : 'text-[var(--color-text-primary)]'
                          }`}
                        >
                          {task.title}
                        </button>
                        {totSub > 0 && (
                          <p className="mt-0.5 font-mono-num text-[11px] text-[var(--color-text-muted)]">
                            Checklist: {doneSub}/{totSub}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="w-36">
                          <Dropdown
                            compact
                            aria-label={`Status tugas ${task.title}`}
                            value={task.column_id}
                            onChange={(colId) =>
                              inlineUpdateMutation.mutate({ id: task.id, patch: { column_id: colId } })
                            }
                            options={columns.map((c) => ({ value: c.id, label: c.name }))}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="w-28">
                          <Dropdown
                            compact
                            aria-label={`Prioritas tugas ${task.title}`}
                            value={task.priority}
                            onChange={(prio) =>
                              inlineUpdateMutation.mutate({ id: task.id, patch: { priority: prio } })
                            }
                            options={[
                              { value: 'low', label: 'Low' },
                              { value: 'medium', label: 'Medium' },
                              { value: 'high', label: 'High' },
                              { value: 'urgent', label: 'Urgent' },
                            ]}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {task.sprint_name && <StatusBadge tone="accent">{task.sprint_name}</StatusBadge>}
                          {task.category_name && <StatusBadge>{task.category_name}</StatusBadge>}
                          {!task.sprint_name && !task.category_name && (
                            <span className="text-xs text-[var(--color-text-muted)]">Backlog</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[var(--color-text-secondary)]">
                            {task.due_date ? formatDateId(task.due_date) : 'Tanpa tenggat'}
                          </span>
                          {task.due_date && task.semantic_type !== 'done' && resolveTaskReminderDays(task) !== null && (
                            <ReminderTag label={formatReminderBadgeLabel(resolveTaskReminderDays(task))} />
                          )}
                          {overdue && <OverdueTag />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            selectTimerTask(task.id, task.title);
                            navigate('/focus');
                          }}
                        >
                          <Timer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          <span>Fokus</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Card List */}
          <ul className="space-y-2.5 md:hidden">
            {tasks.map((task) => {
              const overdue = isTaskOverdue(task.due_date, task.semantic_type);
              return (
                <li
                  key={task.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Pilih tugas ${task.title}`}
                      checked={selectedIds.includes(task.id)}
                      onChange={() => toggleSelect(task.id)}
                      className="mt-1 h-5 w-5 accent-[var(--color-primary)]"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openTaskDrawer(task.id)}
                        className="text-left text-sm font-semibold text-[var(--color-text-primary)]"
                      >
                        {task.title}
                      </button>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge>{task.column_name}</StatusBadge>
                        {task.due_date && task.semantic_type !== 'done' && resolveTaskReminderDays(task) !== null && (
                          <ReminderTag label={formatReminderBadgeLabel(resolveTaskReminderDays(task))} />
                        )}
                        {overdue && <OverdueTag />}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2.5">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {task.due_date ? `Tenggat: ${formatDateId(task.due_date)}` : 'Tanpa tenggat'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={() => openTaskDrawer(task.id)}
                      >
                        Detail
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={() => {
                          selectTimerTask(task.id, task.title);
                          navigate('/focus');
                        }}
                      >
                        Fokus
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmationDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => bulkMutation.mutate({ taskIds: selectedIds, action: 'delete' })}
        isLoading={bulkMutation.isPending}
        title={`Hapus ${selectedIds.length} Tugas Terpilih?`}
        description="Seluruh tugas yang dicentang beserta subtask-nya akan dihapus permanen."
        confirmLabel="Hapus Semua Terpilih"
      />
    </div>
  );
}
