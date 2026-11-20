import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, CheckCircle2, Play, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { repo } from '../../services/repositories/index.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { OverdueTag, PriorityBadge, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { formatDateId, isTaskOverdue } from '../../utils/dateUtils.js';

export function SprintDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [carryoverAction, setCarryoverAction] = useState('backlog');
  const [targetSprintId, setTargetSprintId] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sprint', id],
    queryFn: () => repo.sprints.detail(id),
  });

  const { data: allSprints = [] } = useQuery({
    queryKey: ['sprints'],
    queryFn: () => repo.sprints.list(),
  });

  const { data: backlogTasks = [] } = useQuery({
    queryKey: ['tasks', { sprintId: 'backlog' }],
    queryFn: () => repo.tasks.list({ sprintId: 'backlog' }),
    enabled: assignModalOpen,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['sprint', id] });
    queryClient.invalidateQueries({ queryKey: ['sprints'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  }

  const assignMutation = useMutation({
    mutationFn: ({ taskId, action }) => repo.sprints.assignTask(id, taskId, action),
    onSuccess: (_res, vars) => {
      invalidate();
      toast.success(vars.action === 'add' ? 'Task added to sprint.' : 'Task moved back to Backlog.');
    },
    onError: (err) => toast.error(err.message),
  });

  const startMutation = useMutation({
    mutationFn: () => repo.sprints.start(id, true),
    onSuccess: () => {
      invalidate();
      toast.success('Sprint started.');
    },
    onError: (err) => toast.error(err.message),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      repo.sprints.complete(id, {
        carryoverAction,
        targetSprintId: carryoverAction === 'sprint' ? targetSprintId : null,
      }),
    onSuccess: () => {
      invalidate();
      setCompleteModalOpen(false);
      toast.success('Sprint marked as completed.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => repo.sprints.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Sprint deleted.');
      navigate('/sprints');
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <LoadingState label="Loading sprint details and burndown..." rows={4} />;
  if (isError) return <ErrorState title="Failed to load sprint details" message={error?.message} onRetry={refetch} />;

  const sprint = data?.sprint;
  const tasks = data?.tasks || [];
  const burndown = data?.burndown || [];
  const plannedTargets = allSprints.filter((s) => s.id !== id && s.status === 'planned');

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/sprints"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <span>Back to Sprints</span>
        </Link>

        <header className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={sprint.status === 'active' ? 'accent' : sprint.status === 'completed' ? 'success' : 'secondary'}>
                {sprint.status.toUpperCase()}
              </StatusBadge>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatDateId(sprint.start_date)} to {formatDateId(sprint.end_date)}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{sprint.name}</h1>
            {sprint.goal && <p className="text-sm text-[var(--color-text-secondary)]">Goal: {sprint.goal}</p>}
            {sprint.description && <p className="text-xs text-[var(--color-text-muted)]">{sprint.description}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sprint.status === 'planned' && (
              <Button onClick={() => startMutation.mutate()} isLoading={startMutation.isPending}>
                <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Start Sprint</span>
              </Button>
            )}
            {sprint.status === 'active' && (
              <Button onClick={() => setCompleteModalOpen(true)}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Complete Sprint</span>
              </Button>
            )}
            <Button variant="outline" onClick={() => setAssignModalOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Assign from Backlog</span>
            </Button>
            <Button variant="secondary" onClick={() => openQuickAdd({ sprintId: sprint.id })}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Create New Task</span>
            </Button>
            <Button
              variant="ghost"
              aria-label="Delete sprint"
              className="text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
        </header>
      </div>

      {/* Sprint Metrics Bar */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)]">Sprint Progress</p>
          <p className="mt-1 font-mono-num text-2xl font-semibold text-[var(--color-accent-text)]">
            {sprint.progress_percent}%
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
            <div className="h-full bg-[var(--color-primary)]" style={{ width: `${sprint.progress_percent}%` }} />
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)]">Completed Tasks</p>
          <p className="mt-1 font-mono-num text-2xl font-semibold text-[var(--color-success)]">
            {sprint.completed_tasks} <span className="text-sm font-normal text-[var(--color-text-muted)]">/ {sprint.total_tasks}</span>
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)]">Remaining Tasks</p>
          <p className="mt-1 font-mono-num text-2xl font-semibold text-[var(--color-text-primary)]">
            {sprint.remaining_tasks}
          </p>
        </div>
      </section>

      {/* Burndown Visualization */}
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Remaining sprint tasks vs daily target (Ideal vs Actual)
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            The actual line stops at today and reflects real tasks moved to the Done column.
          </p>
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            title="No tasks in this sprint to plot on the burndown chart"
            description="Add tasks in the Sprint Tasks section below to start tracking the burndown curve."
          />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burndown} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-elevated)',
                    borderColor: 'var(--color-border)',
                    borderRadius: '8px',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="ideal_remaining"
                  name="Ideal Target"
                  stroke="var(--color-text-muted)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual_remaining"
                  name="Actual Remaining"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: 'var(--color-primary)' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Sprint Task List */}
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-base font-semibold text-[var(--color-text-primary)]">
          Sprint Tasks ({tasks.length})
        </h2>

        {tasks.length === 0 ? (
          <EmptyState
            title="This sprint has no tasks yet"
            description="Assign existing tasks from Backlog or create a new task directly into this sprint."
            action={
              <Button size="sm" onClick={() => setAssignModalOpen(true)}>
                Assign from Backlog
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {tasks.map((task) => {
              const overdue = isTaskOverdue(task.due_date, task.semantic_type);
              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <button
                      type="button"
                      onClick={() => openTaskDrawer(task.id)}
                      className={`text-left text-sm font-medium hover:text-[var(--color-accent-text)] hover:underline ${
                        task.semantic_type === 'done'
                          ? 'line-through text-[var(--color-text-muted)]'
                          : 'text-[var(--color-text-primary)]'
                      }`}
                    >
                      {task.title}
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={task.semantic_type === 'done' ? 'success' : 'neutral'}>
                        {task.column_name}
                      </StatusBadge>
                      <PriorityBadge priority={task.priority} />
                      {overdue && <OverdueTag />}
                      {task.due_date && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Due: {formatDateId(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => assignMutation.mutate({ taskId: task.id, action: 'remove' })}
                    aria-label={`Remove ${task.title} from sprint`}
                    className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>Remove</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Assign from Backlog Modal */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign Tasks from Backlog"
        subtitle="Select tasks not currently assigned to any sprint."
      >
        {backlogTasks.length === 0 ? (
          <EmptyState
            title="No tasks in Backlog"
            description="All of your tasks are already assigned to sprints or you have not created any yet."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setAssignModalOpen(false);
                  openQuickAdd({ sprintId: sprint.id });
                }}
              >
                Create Task in This Sprint
              </Button>
            }
          />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {backlogTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{t.title}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge>{t.column_name}</StatusBadge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={assignMutation.isPending}
                  onClick={() => assignMutation.mutate({ taskId: t.id, action: 'add' })}
                >
                  Assign
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Complete Sprint & Carry-Over Dialog */}
      <Modal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        title={`Complete ${sprint.name}?`}
        subtitle={`Completed: ${sprint.completed_tasks} tasks | Remaining: ${sprint.remaining_tasks} tasks`}
      >
        <div className="space-y-4">
          {sprint.remaining_tasks > 0 ? (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">
                There are still {sprint.remaining_tasks} tasks not marked as Done. Choose where to move remaining tasks:
              </p>
              <Dropdown
                label="Action for remaining tasks"
                value={carryoverAction}
                onChange={setCarryoverAction}
                options={[
                  { value: 'backlog', label: 'Return to Backlog (No Sprint)' },
                  ...(plannedTargets.length > 0
                    ? [{ value: 'sprint', label: 'Move to Another Planned Sprint' }]
                    : []),
                ]}
              />
              {carryoverAction === 'sprint' && (
                <Dropdown
                  label="Select Destination Sprint"
                  value={targetSprintId || plannedTargets[0]?.id || ''}
                  onChange={setTargetSprintId}
                  options={plannedTargets.map((pt) => ({ value: pt.id, label: pt.name }))}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Every task in this sprint is complete. Closing the sprint will save it to Sprint History.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCompleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={completeMutation.isPending}
              onClick={() => {
                if (carryoverAction === 'sprint' && !targetSprintId && plannedTargets[0]) {
                  setTargetSprintId(plannedTargets[0].id);
                }
                completeMutation.mutate();
              }}
            >
              Complete Sprint
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
        title={`Delete Sprint "${sprint.name}"?`}
        description="This sprint will be permanently deleted, while all tasks inside remain safe and return to Backlog."
        confirmLabel="Yes, Delete Sprint"
      />
    </div>
  );
}
