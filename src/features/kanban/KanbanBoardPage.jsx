import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Columns3,
  Eye,
  GripVertical,
  Inbox,
  ListTodo,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { repo } from '../../services/repositories/index.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { OverdueTag, PriorityBadge, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { formatDateId, isTaskOverdue } from '../../utils/dateUtils.js';

function TaskCardContent({ task, onOpenDrawer, onOpenMoveSheet, isDragging = false }) {
  const doneSub = (task.subtasks || []).filter((s) => s.is_completed).length;
  const totalSub = (task.subtasks || []).length;
  const overdue = isTaskOverdue(task.due_date, task.semantic_type);

  return (
    <div
      className={`rounded-[var(--radius-md)] border bg-[var(--color-surface-elevated)] p-3.5 transition-colors ${
        isDragging
          ? 'border-[var(--color-primary)] opacity-90'
          : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
      }`}
      style={isDragging ? { boxShadow: 'var(--shadow-drag)' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {task.category_name && <StatusBadge>{task.category_name}</StatusBadge>}
          {overdue && <OverdueTag />}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenDrawer(task.id)}
        className={`mt-2.5 block w-full text-left text-sm font-medium leading-snug hover:text-[var(--color-accent-text)] ${
          task.semantic_type === 'done'
            ? 'line-through text-[var(--color-text-muted)]'
            : 'text-[var(--color-text-primary)]'
        }`}
      >
        {task.title}
      </button>

      {(task.labels || []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((lb) => (
            <span
              key={lb.id}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
            >
              {lb.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2.5 text-[11px] text-[var(--color-text-muted)]">
        <div className="flex items-center gap-2.5">
          {task.due_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
              {formatDateId(task.due_date, 'd MMM')}
            </span>
          )}
          {totalSub > 0 && (
            <span className="inline-flex items-center gap-1 font-mono-num">
              <CheckSquare className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
              {doneSub}/{totalSub}
            </span>
          )}
        </div>

        {task.sprint_name && (
          <span className="max-w-[120px] truncate font-medium text-[var(--color-accent-text)]">
            {task.sprint_name}
          </span>
        )}
      </div>

      {/* Touch-friendly mobile status action trigger */}
      {onOpenMoveSheet && (
        <div className="mt-2.5 md:hidden">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] w-full justify-between"
            onClick={() => onOpenMoveSheet(task)}
          >
            <span>Pindah Status</span>
            <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

function SortableTaskCard({ task, onOpenDrawer, onOpenMoveSheet }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Seret kartu ${task.title}`}
        className="hidden md:inline-flex absolute right-2 top-2.5 h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] group-hover:opacity-100 focus:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <TaskCardContent task={task} onOpenDrawer={onOpenDrawer} onOpenMoveSheet={onOpenMoveSheet} />
    </div>
  );
}

const COLUMN_ICONS = {
  backlog: Inbox,
  todo: ListTodo,
  in_progress: PlayCircle,
  review: Eye,
  done: CheckCircle2,
};

function DroppableColumn({ column, tasks, onAddTask, onManageColumn, onOpenDrawer }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${column.id}`,
    data: { type: 'column', column },
  });
  const ColIcon = COLUMN_ICONS[column.semantic_type] || Columns3;

  return (
    <section
      aria-label={`Kolom ${column.name}`}
      className={`flex w-[292px] shrink-0 flex-col rounded-[var(--radius-lg)] border bg-[var(--color-surface)]/95 transition-colors ${
        isOver ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ColIcon className="h-4 w-4 shrink-0 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{column.name}</h2>
          <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono-num text-[11px] font-medium text-[var(--color-text-secondary)]">
            {tasks.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onManageColumn(column)}
            aria-label={`Kelola kolom ${column.name}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onAddTask(column.id)}
            aria-label={`Tambah tugas di kolom ${column.name}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div ref={setNodeRef} className="flex-1 space-y-2.5 p-2.5 min-h-[240px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="flex h-28 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 text-center text-xs text-[var(--color-text-muted)]">
              Belum ada tugas di kolom ini. Seret kartu atau klik +.
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} onOpenDrawer={onOpenDrawer} />
            ))
          )}
        </SortableContext>
      </div>
    </section>
  );
}

export function KanbanBoardPage() {
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [activeDragTask, setActiveDragTask] = useState(null);
  const [mobileColumnId, setMobileColumnId] = useState('');
  const [moveSheetTask, setMoveSheetTask] = useState(null);

  // Column Management Modals
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColSem, setNewColSem] = useState('in_progress');
  const [manageCol, setManageCol] = useState(null);
  const [editColName, setEditColName] = useState('');
  const [editColSem, setEditColSem] = useState('todo');
  const [deleteTargetColId, setDeleteTargetColId] = useState('');
  const [confirmColDelete, setConfirmColDelete] = useState(false);

  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);
  const queryClient = useQueryClient();

  const filters = useMemo(
    () => ({ search, priority, categoryId, sprintId, deadline, sort: 'position' }),
    [search, priority, categoryId, sprintId, deadline]
  );

  const { data: columns = [], isLoading: colsLoading, isError: colsError, refetch: refetchCols } = useQuery({
    queryKey: ['columns'],
    queryFn: () => repo.columns.list(),
  });

  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError, error: tasksErrObj, refetch: refetchTasks } = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => repo.tasks.list(filters),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => repo.taxonomy.listCategories(),
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints'],
    queryFn: () => repo.sprints.list(),
  });

  useEffect(() => {
    if (columns.length > 0 && (!mobileColumnId || !columns.some((c) => c.id === mobileColumnId))) {
      setMobileColumnId(columns[0].id);
    }
  }, [columns, mobileColumnId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['columns'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['sprints'] });
    queryClient.invalidateQueries({ queryKey: ['sprint'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  }

  const moveMutation = useMutation({
    mutationFn: ({ id, column_id, position_in_column }) =>
      repo.tasks.update(id, { column_id, position_in_column }),
    onMutate: async ({ id, column_id, position_in_column }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', filters] });
      const prev = queryClient.getQueryData(['tasks', filters]);
      const targetCol = columns.find((c) => c.id === column_id);
      queryClient.setQueryData(['tasks', filters], (old = []) =>
        old
          .map((t) =>
            t.id === id
              ? {
                  ...t,
                  column_id,
                  position_in_column,
                  column_name: targetCol?.name || t.column_name,
                  semantic_type: targetCol?.semantic_type || t.semantic_type,
                }
              : t
          )
          .sort((a, b) => a.position_in_column - b.position_in_column)
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks', filters], ctx.prev);
      toast.error(err.message || 'Gagal memindahkan kartu.');
    },
    onSettled: () => invalidateAll(),
  });

  const createColMutation = useMutation({
    mutationFn: (payload) => repo.columns.create(payload),
    onSuccess: () => {
      invalidateAll();
      setAddColOpen(false);
      setNewColName('');
      toast.success('Kolom kustom berhasil ditambahkan.');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateColMutation = useMutation({
    mutationFn: ({ id, payload }) => repo.columns.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setManageCol(null);
      toast.success('Kolom diperbarui.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteColMutation = useMutation({
    mutationFn: ({ id, targetColumnId }) => repo.columns.remove(id, targetColumnId),
    onSuccess: () => {
      invalidateAll();
      setConfirmColDelete(false);
      setManageCol(null);
      toast.success('Kolom dihapus.');
    },
    onError: (err) => toast.error(err.message),
  });

  const tasksByColumn = useMemo(() => {
    const map = new Map();
    for (const col of columns) map.set(col.id, []);
    for (const t of tasks) {
      if (map.has(t.column_id)) {
        map.get(t.column_id).push(t);
      }
    }
    return map;
  }, [columns, tasks]);

  function handleDragStart(event) {
    const task = event.active?.data?.current?.task;
    if (task) setActiveDragTask(task);
  }

  function handleDragEnd(event) {
    setActiveDragTask(null);
    const { active, over } = event;
    if (!over) return;

    const draggedTask = active.data?.current?.task;
    if (!draggedTask) return;

    let targetColumnId = null;
    let targetPos = draggedTask.position_in_column;

    if (String(over.id).startsWith('col:')) {
      targetColumnId = String(over.id).slice(4);
      const colTasks = (tasksByColumn.get(targetColumnId) || []).filter((t) => t.id !== draggedTask.id);
      const last = colTasks[colTasks.length - 1];
      targetPos = last ? last.position_in_column + 1000 : 1000;
    } else {
      const overTask = over.data?.current?.task;
      if (!overTask) return;
      targetColumnId = overTask.column_id;
      const colTasks = (tasksByColumn.get(targetColumnId) || []).filter((t) => t.id !== draggedTask.id);
      const overIndex = colTasks.findIndex((t) => t.id === overTask.id);
      if (overIndex === -1) {
        const last = colTasks[colTasks.length - 1];
        targetPos = last ? last.position_in_column + 1000 : 1000;
      } else {
        const prevTask = colTasks[overIndex - 1];
        const nextTask = colTasks[overIndex];
        if (!prevTask) targetPos = nextTask.position_in_column - 500;
        else targetPos = (prevTask.position_in_column + nextTask.position_in_column) / 2;
      }
    }

    if (targetColumnId && (targetColumnId !== draggedTask.column_id || targetPos !== draggedTask.position_in_column)) {
      moveMutation.mutate({
        id: draggedTask.id,
        column_id: targetColumnId,
        position_in_column: targetPos,
      });
    }
  }

  const hasFilters = Boolean(search || priority || categoryId || sprintId || deadline);

  if (colsLoading || tasksLoading) {
    return <LoadingState label="Memuat Kanban Board..." rows={4} />;
  }

  if (colsError || tasksError) {
    return (
      <ErrorState
        title="Gagal memuat Kanban Board"
        message={tasksErrObj?.message}
        onRetry={() => {
          refetchCols();
          refetchTasks();
        }}
      />
    );
  }

  const activeMobileCol = columns.find((c) => c.id === mobileColumnId) || columns[0];
  const mobileColTasks = activeMobileCol ? tasksByColumn.get(activeMobileCol.id) || [] : [];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Kanban Board</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Kelola alur kerja visual lintas kolom dengan drag-and-drop atau kontrol status cepat.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setAddColOpen(true)}>
            <Settings2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Tambah Kolom</span>
          </Button>
          <Button onClick={() => openQuickAdd()}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Buat Tugas</span>
          </Button>
        </div>
      </header>

      {/* Filter Bar */}
      <section aria-label="Filter Kanban" className="grid grid-cols-1 gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Cari kartu di board"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kartu di papan..."
            className="min-h-[38px] h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] pl-10 pr-3.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        <Dropdown
          compact
          aria-label="Filter prioritas board"
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
          compact
          aria-label="Filter kategori board"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: '', label: 'Semua Kategori' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />

        <Dropdown
          compact
          aria-label="Filter sprint board"
          value={sprintId}
          onChange={setSprintId}
          options={[
            { value: '', label: 'Semua Sprint' },
            { value: 'backlog', label: 'Tanpa Sprint' },
            ...sprints.map((sp) => ({ value: sp.id, label: sp.name })),
          ]}
        />

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Dropdown
              compact
              aria-label="Filter deadline board"
              value={deadline}
              onChange={setDeadline}
              options={[
                { value: '', label: 'Semua Tenggat' },
                { value: 'overdue', label: 'Terlambat' },
                { value: 'today', label: 'Hari Ini' },
                { value: 'week', label: 'Minggu Ini' },
              ]}
            />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset filter board"
              onClick={() => {
                setSearch('');
                setPriority('');
                setCategoryId('');
                setSprintId('');
                setDeadline('');
              }}
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          )}
        </div>
      </section>

      {hasFilters && tasks.length === 0 && (
        <EmptyState
          icon={Columns3}
          title="Filter menyembunyikan seluruh kartu"
          description="Tidak ada kartu yang memenuhi kombinasi filter saat ini."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch('');
                setPriority('');
                setCategoryId('');
                setSprintId('');
                setDeadline('');
              }}
            >
              Reset Filter Board
            </Button>
          }
        />
      )}

      {/* Desktop Multi-Column Drag-and-Drop Board with Subtle Tactile Texture */}
      <div className="hidden md:block surface-texture rounded-[var(--radius-lg)] border border-[var(--color-border)]/60 p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragTask(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((col) => (
              <DroppableColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn.get(col.id) || []}
                onAddTask={(columnId) => openQuickAdd({ columnId })}
                onManageColumn={(c) => {
                  setManageCol(c);
                  setEditColName(c.name);
                  setEditColSem(c.semantic_type);
                  const fallback = columns.find((other) => other.id !== c.id)?.id || '';
                  setDeleteTargetColId(fallback);
                }}
                onOpenDrawer={openTaskDrawer}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDragTask ? (
              <div className="w-[276px]">
                <TaskCardContent task={activeDragTask} onOpenDrawer={() => {}} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Mobile Touch-Optimized Column Switcher + Status Bottom Sheet (<768px) */}
      <div className="space-y-4 md:hidden">
        <div role="tablist" aria-label="Pilih kolom Kanban" className="flex gap-2 overflow-x-auto pb-1">
          {columns.map((col) => {
            const count = (tasksByColumn.get(col.id) || []).length;
            const active = activeMobileCol?.id === col.id;
            return (
              <button
                key={col.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileColumnId(col.id)}
                className={`min-h-[44px] shrink-0 rounded-[var(--radius-sm)] border px-3.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-secondary)] text-[var(--color-text-primary)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                }`}
              >
                {col.name} ({count})
              </button>
            );
          })}
        </div>

        {activeMobileCol && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {activeMobileCol.name} ({mobileColTasks.length})
              </h2>
              <Button size="sm" variant="secondary" onClick={() => openQuickAdd({ columnId: activeMobileCol.id })}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Tambah di Kolom Ini</span>
              </Button>
            </div>

            {mobileColTasks.length === 0 ? (
              <EmptyState
                icon={Columns3}
                title={`Kolom ${activeMobileCol.name} masih kosong`}
                description="Tambahkan tugas baru langsung ke kolom ini atau pindahkan tugas dari kolom lain."
                action={
                  <Button size="sm" onClick={() => openQuickAdd({ columnId: activeMobileCol.id })}>
                    Tambah Tugas
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {mobileColTasks.map((task) => (
                  <TaskCardContent
                    key={task.id}
                    task={task}
                    onOpenDrawer={openTaskDrawer}
                    onOpenMoveSheet={setMoveSheetTask}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Move Status Action Modal */}
      <Modal
        open={Boolean(moveSheetTask)}
        onClose={() => setMoveSheetTask(null)}
        title="Pindahkan Status Tugas"
        subtitle={moveSheetTask?.title}
      >
        <div className="space-y-2">
          {columns.map((col) => {
            const isCurrent = moveSheetTask?.column_id === col.id;
            return (
              <button
                key={col.id}
                type="button"
                disabled={isCurrent}
                onClick={() => {
                  const colTasks = tasksByColumn.get(col.id) || [];
                  const last = colTasks[colTasks.length - 1];
                  moveMutation.mutate({
                    id: moveSheetTask.id,
                    column_id: col.id,
                    position_in_column: last ? last.position_in_column + 1000 : 1000,
                  });
                  setMoveSheetTask(null);
                  toast.success(`Dipindahkan ke ${col.name}`);
                }}
                className={`flex min-h-[48px] w-full items-center justify-between rounded-[var(--radius-sm)] border px-4 text-sm font-medium ${
                  isCurrent
                    ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)] text-[var(--color-accent-text)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]'
                }`}
              >
                <span>{col.name}</span>
                {isCurrent && <span className="text-xs">Posisi Saat Ini</span>}
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Add Custom Column Modal */}
      <Modal
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
        title="Tambah Kolom Kanban Kustom"
        subtitle="Kolom kustom tetap terhubung ke pemetaan progres sprint."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newColName.trim()) return;
            createColMutation.mutate({ name: newColName.trim(), semantic_type: newColSem });
          }}
          className="space-y-4"
        >
          <Input
            label="Nama Kolom"
            placeholder="Mis. QA Testing atau Menunggu Review"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            required
          />
          <Dropdown
            label="Kategori Semantik (Untuk Kalkulasi Progres)"
            value={newColSem}
            onChange={setNewColSem}
            options={[
              { value: 'backlog', label: 'Backlog (Belum Dijadwalkan)' },
              { value: 'todo', label: 'To Do (Siap Dikerjakan)' },
              { value: 'in_progress', label: 'In Progress (Sedang Berjalan)' },
              { value: 'review', label: 'Review (Peninjauan)' },
              { value: 'done', label: 'Done (Terhitung Selesai)' },
            ]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddColOpen(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={createColMutation.isPending}>
              Buat Kolom
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manage / Edit / Delete Column Modal */}
      <Modal
        open={Boolean(manageCol) && !confirmColDelete}
        onClose={() => setManageCol(null)}
        title={`Kelola Kolom: ${manageCol?.name || ''}`}
      >
        <div className="space-y-4">
          <Input label="Nama Kolom" value={editColName} onChange={(e) => setEditColName(e.target.value)} />
          <Dropdown
            label="Kategori Semantik"
            value={editColSem}
            onChange={setEditColSem}
            options={[
              { value: 'backlog', label: 'Backlog' },
              { value: 'todo', label: 'To Do' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'review', label: 'Review' },
              { value: 'done', label: 'Done' },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
            <Button
              variant="ghost"
              className="text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
              onClick={() => setConfirmColDelete(true)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Hapus Kolom</span>
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setManageCol(null)}>
                Tutup
              </Button>
              <Button
                isLoading={updateColMutation.isPending}
                onClick={() =>
                  updateColMutation.mutate({
                    id: manageCol.id,
                    payload: { name: editColName.trim(), semantic_type: editColSem },
                  })
                }
              >
                Simpan
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Column Confirmation + Task Migration */}
      <ConfirmationDialog
        open={confirmColDelete}
        onClose={() => setConfirmColDelete(false)}
        onConfirm={() =>
          deleteColMutation.mutate({
            id: manageCol.id,
            targetColumnId: deleteTargetColId,
          })
        }
        isLoading={deleteColMutation.isPending}
        title={`Hapus Kolom "${manageCol?.name || ''}"?`}
        description="Jika kolom ini masih memiliki tugas, semua tugas di dalamnya akan dipindahkan ke kolom tujuan di bawah."
        confirmLabel="Hapus Kolom"
      >
        {(tasksByColumn.get(manageCol?.id) || []).length > 0 && (
          <Dropdown
            label="Pindahkan tugas yang ada ke kolom:"
            value={deleteTargetColId}
            onChange={setDeleteTargetColId}
            options={columns
              .filter((c) => c.id !== manageCol?.id)
              .map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
      </ConfirmationDialog>
    </div>
  );
}
