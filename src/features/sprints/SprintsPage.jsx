import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowUpRight, CalendarRange, Edit2, Play, Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { repo } from '../../services/repositories/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { addDaysIso, daysRemaining, formatDateId, getTodayIso } from '../../utils/dateUtils.js';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'planned', label: 'Planned' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
];

const STATUS_BADGE_MAP = {
  active: { label: 'Active', tone: 'accent' },
  planned: { label: 'Planned', tone: 'secondary' },
  completed: { label: 'Completed', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export function SprintsPage() {
  const [tab, setTab] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(getTodayIso());
  const [endDate, setEndDate] = useState(addDaysIso(getTodayIso(), 13));
  const [formErr, setFormErr] = useState('');

  const [conflictStartSprint, setConflictStartSprint] = useState(null);
  const [activeConflictInfo, setActiveConflictInfo] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const queryClient = useQueryClient();

  const { data: sprints = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sprints'],
    queryFn: () => repo.sprints.list(),
  });

  function invalidateSprints() {
    queryClient.invalidateQueries({ queryKey: ['sprints'] });
    queryClient.invalidateQueries({ queryKey: ['sprint'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  }

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editingSprint ? repo.sprints.update(editingSprint.id, payload) : repo.sprints.create(payload),
    onSuccess: () => {
      invalidateSprints();
      setFormOpen(false);
      setEditingSprint(null);
      toast.success(editingSprint ? 'Sprint updated.' : 'New sprint created.');
    },
    onError: (err) => setFormErr(err.message || 'Failed to save sprint.'),
  });

  const startMutation = useMutation({
    mutationFn: ({ id, forceCompleteActive }) => repo.sprints.start(id, forceCompleteActive),
    onSuccess: () => {
      invalidateSprints();
      setConflictStartSprint(null);
      setActiveConflictInfo(null);
      toast.success('Sprint started.');
    },
    onError: (err) => {
      if (err.code === 'ACTIVE_SPRINT_EXISTS' && err.data?.activeSprint) {
        setActiveConflictInfo(err.data.activeSprint);
      } else {
        toast.error(err.message || 'Failed to start sprint.');
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => repo.sprints.update(id, { status: 'archived' }),
    onSuccess: () => {
      invalidateSprints();
      toast.success('Sprint archived.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => repo.sprints.remove(id),
    onSuccess: () => {
      invalidateSprints();
      setDeleteTarget(null);
      toast.success('Sprint deleted. All tasks were returned to Backlog.');
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreateModal() {
    const today = getTodayIso();
    setEditingSprint(null);
    setName('');
    setDescription('');
    setGoal('');
    setStartDate(today);
    setEndDate(addDaysIso(today, 13));
    setFormErr('');
    setFormOpen(true);
  }

  function openEditModal(sp) {
    setEditingSprint(sp);
    setName(sp.name);
    setDescription(sp.description || '');
    setGoal(sp.goal || '');
    setStartDate(sp.start_date);
    setEndDate(sp.end_date);
    setFormErr('');
    setFormOpen(true);
  }

  function applyDurationPreset(daysCount) {
    setEndDate(addDaysIso(startDate, daysCount - 1));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormErr('Sprint name is required.');
      return;
    }
    if (endDate < startDate) {
      setFormErr('End date must be on or after the start date.');
      return;
    }
    setFormErr('');
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      goal: goal.trim(),
      start_date: startDate,
      end_date: endDate,
    });
  }

  const filtered = tab === 'all' ? sprints : sprints.filter((s) => s.status === tab);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            Sprint Management
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Plan time-boxed delivery cycles, monitor completion ratios, and review burndown history.
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>New Sprint</span>
        </Button>
      </header>

      {/* Status Tabs */}
      <div role="tablist" aria-label="Filter sprint status" className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const active = tab === t.id;
          const count = t.id === 'all' ? sprints.length : sprints.filter((s) => s.status === t.id).length;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`min-h-[38px] rounded-[var(--radius-sm)] border px-3 text-xs font-semibold transition-colors ${
                active
                  ? 'border-[var(--color-primary)] bg-[var(--color-secondary)] text-[var(--color-text-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <LoadingState label="Loading sprints..." rows={3} />
      ) : isError ? (
        <ErrorState title="Failed to load sprints" message={error?.message} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Zap}
          title={tab === 'all' ? 'No sprints created yet' : `No ${tab} sprints found`}
          description="Group tasks into 1 to 2 week sprint cycles to track goals and burndown charts."
          action={
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Create First Sprint</span>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((sp) => {
            const badge = STATUS_BADGE_MAP[sp.status] || STATUS_BADGE_MAP.planned;
            const remDays = daysRemaining(sp.end_date);
            return (
              <article
                key={sp.id}
                className="flex flex-col justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                        {sp.status === 'active' && remDays < 0 && (
                          <StatusBadge tone="danger">Past End Date</StatusBadge>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{sp.name}</h2>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(sp)}
                        aria-label={`Edit sprint ${sp.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
                      >
                        <Edit2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(sp)}
                        aria-label={`Delete sprint ${sp.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {sp.goal && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{sp.goal}</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {formatDateId(sp.start_date)} to {formatDateId(sp.end_date)}
                    </span>
                  </div>

                  {/* Progress Track */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--color-text-secondary)]">
                        Done: {sp.completed_tasks} | Remaining: {sp.remaining_tasks}
                      </span>
                      <span className="font-mono-num font-semibold text-[var(--color-text-primary)]">
                        {sp.progress_percent}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)]">
                      <div
                        className="h-full bg-[var(--color-primary)] transition-[width] duration-300"
                        style={{ width: `${sp.progress_percent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
                  <div className="flex flex-wrap gap-2">
                    {sp.status === 'planned' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setConflictStartSprint(sp);
                          startMutation.mutate({ id: sp.id, forceCompleteActive: false });
                        }}
                      >
                        <Play className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        <span>Start Sprint</span>
                      </Button>
                    )}
                    {sp.status === 'completed' && (
                      <Button size="sm" variant="outline" onClick={() => archiveMutation.mutate(sp.id)}>
                        <Archive className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        <span>Archive</span>
                      </Button>
                    )}
                  </div>

                  <Link
                    to={`/sprints/${sp.id}`}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]"
                  >
                    <span>Details &amp; Burndown</span>
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Sprint Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingSprint ? 'Edit Sprint' : 'Create New Sprint'}
        subtitle="Set the date range and main goal for this sprint."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formErr && (
            <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
              {formErr}
            </div>
          )}

          <Input
            label="Sprint Name"
            placeholder="e.g. Sprint 03: Calendar Integration"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Sprint Goal"
            placeholder="What is the primary outcome for this cycle?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />

          <Textarea
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">Quick Duration Presets</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => applyDurationPreset(7)}>
                1 Week (7 Days)
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => applyDurationPreset(14)}>
                2 Weeks (14 Days)
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => applyDurationPreset(30)}>
                1 Month (30 Days)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saveMutation.isPending}>
              {editingSprint ? 'Save Changes' : 'Save Sprint'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Active Sprint Conflict Resolution Dialog */}
      <ConfirmationDialog
        open={Boolean(activeConflictInfo && conflictStartSprint)}
        onClose={() => {
          setActiveConflictInfo(null);
          setConflictStartSprint(null);
        }}
        onConfirm={() => startMutation.mutate({ id: conflictStartSprint.id, forceCompleteActive: true })}
        isLoading={startMutation.isPending}
        variant="primary"
        title="Active Sprint Already Running"
        description={`Sprint "${activeConflictInfo?.name || ''}" is still active. Complete it and move unfinished tasks back to Backlog so you can start "${conflictStartSprint?.name || ''}"?`}
        confirmLabel="Complete Current & Start New"
      />

      {/* Safe Sprint Delete Confirmation */}
      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        isLoading={deleteMutation.isPending}
        title={`Delete Sprint "${deleteTarget?.name || ''}"?`}
        description="This sprint will be permanently removed, while all tasks inside it stay safe and return to Backlog."
        confirmLabel="Yes, Delete Sprint"
      />
    </div>
  );
}
