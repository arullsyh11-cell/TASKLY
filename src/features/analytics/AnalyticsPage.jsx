import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, CheckCircle2, Clock, TrendingUp, Zap } from 'lucide-react';
import { repo } from '../../services/repositories/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { formatDateId, formatDurationHuman } from '../../utils/dateUtils.js';

export function AnalyticsPage() {
  const [range, setRange] = useState('7d');
  const [cadence, setCadence] = useState('daily');
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => repo.analytics.getReport(range),
  });

  if (isLoading) return <LoadingState label="Calculating productivity stats..." rows={4} />;
  if (isError) return <ErrorState title="Failed to load analytics" message={error?.message} onRetry={refetch} />;

  const summary = data?.summary || {};
  const hasAnyData =
    (summary.total_tasks || 0) > 0 ||
    (summary.completed_focus_sessions || 0) > 0 ||
    (summary.interrupted_focus_sessions || 0) > 0;

  const chartData =
    cadence === 'weekly'
      ? data?.weekly_productivity || []
      : cadence === 'monthly'
      ? data?.monthly_productivity || []
      : data?.daily_trend || [];

  const xKey = cadence === 'monthly' ? 'month' : 'label';
  const maxCompletedVal = Math.max(0, ...chartData.map((d) => Number(d.tasks_completed || 0)));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            Analytics &amp; Productivity Insights
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Data-driven insights from your completed tasks, sprints, and focus session logs.
          </p>
        </div>

        {/* Segmented Pill Cadence Tabs */}
        <div
          role="tablist"
          aria-label="Select trend cadence"
          className="grid w-full grid-cols-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 sm:inline-flex sm:w-auto"
        >
          {[
            { id: 'daily', label: 'Daily' },
            { id: 'weekly', label: 'Weekly' },
            { id: 'monthly', label: 'Monthly' },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cadence === c.id}
              onClick={() => setCadence(c.id)}
              className={`min-h-[38px] rounded-full px-3 sm:px-4 text-center text-xs font-semibold transition-colors ${
                cadence === c.id
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      {!hasAnyData ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics data to display yet"
          description="Insights will populate automatically once you create tasks, complete cards on the Kanban board, or finish a Focus Mode session."
          action={<Button onClick={() => navigate('/board')}>Open Kanban Board</Button>}
          secondaryAction={
            <Button variant="secondary" onClick={() => navigate('/focus')}>
              Start Focus Mode
            </Button>
          }
        />
      ) : (
        <>
          {/* Hero Chart Card */}
          <section className="surface-texture rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <span>Task Completion Rate</span>
                </p>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="font-mono-num text-3xl font-bold text-[var(--color-text-primary)]">
                    {summary.completion_rate}%
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    ({summary.completed_tasks} completed out of {summary.total_tasks} tasks)
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  How many tasks were finished per period? The tallest bar highlights your peak productivity.
                </p>
              </div>

              <div className="w-44 shrink-0">
                <Dropdown
                  compact
                  aria-label="Select analysis time range"
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: '7d', label: 'Last 7 Days' },
                    { value: '30d', label: 'Last 30 Days' },
                    { value: '90d', label: 'Last 90 Days' },
                  ]}
                />
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey={xKey} stroke="var(--color-text-muted)" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-elevated)',
                      borderColor: 'var(--color-border)',
                      borderRadius: '12px',
                      color: 'var(--color-text-primary)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="tasks_completed"
                    name="Tasks Completed"
                    radius={[10, 10, 4, 4]}
                    isAnimationActive={false}
                  >
                    {chartData.map((entry, idx) => {
                      const isPeak = maxCompletedVal > 0 && Number(entry.tasks_completed) === maxCompletedVal;
                      return (
                        <Cell
                          key={`cell-${idx}`}
                          fill={isPeak ? 'var(--color-primary)' : 'var(--color-border-strong)'}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Asymmetric Bottom Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left Tall Card: Focus Time Area Trend */}
            <section className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)]">
                    <Clock className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="font-mono-num text-xs text-[var(--color-text-muted)]">
                    {summary.completed_focus_sessions} done / {summary.interrupted_focus_sessions} paused
                  </span>
                </div>
                <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
                  How much focus time was logged in the selected range?
                </p>
                <p className="mt-1 font-mono-num text-2xl font-bold text-[var(--color-text-primary)]">
                  {formatDurationHuman(summary.range_focus_sec)}
                </p>
              </div>

              <div className="mt-4 h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="focusAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey={xKey} stroke="var(--color-text-muted)" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        borderColor: 'var(--color-border)',
                        borderRadius: '12px',
                        color: 'var(--color-text-primary)',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="focus_minutes"
                      name="Focus Minutes"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      fill="url(#focusAreaGrad)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Right Stacked 2 Cards: Status Breakdown + Sprint Completion */}
            <div className="space-y-4 lg:col-span-6">
              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Completed vs Pending ({summary.completed_tasks} / {summary.pending_tasks})
                    </h2>
                    <p className="text-xs text-[var(--color-text-secondary)]">Distribution across each workflow stage</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" strokeWidth={1.75} aria-hidden="true" />
                </div>

                <div className="space-y-2.5">
                  {(data?.status_breakdown || []).map((st) => {
                    const pct = summary.total_tasks ? Math.round((st.count / summary.total_tasks) * 100) : 0;
                    return (
                      <div key={st.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[var(--color-text-primary)]">{st.label}</span>
                          <span className="font-mono-num text-[var(--color-text-secondary)]">
                            {st.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)]">
                          <div
                            className={`h-full ${
                              st.key === 'done' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
                  <Zap className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <span>Sprint Completion Rate by Cycle</span>
                </h2>
                {(data?.sprint_rates || []).length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    No active or completed sprints to compare yet.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--color-border)]">
                    {data.sprint_rates.map((sp) => (
                      <li key={sp.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <Link
                            to={`/sprints/${sp.id}`}
                            className="block truncate text-xs font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-accent-text)] hover:underline"
                          >
                            {sp.name}
                          </Link>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {formatDateId(sp.start_date, 'MMM d')} - {formatDateId(sp.end_date, 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge tone={sp.status === 'completed' ? 'success' : 'accent'}>
                            {sp.completed_tasks}/{sp.total_tasks}
                          </StatusBadge>
                          <span className="w-10 text-right font-mono-num text-xs font-bold text-[var(--color-text-primary)]">
                            {sp.completion_rate}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
