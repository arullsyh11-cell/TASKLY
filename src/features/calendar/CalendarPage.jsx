import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Zap } from 'lucide-react';
import { repo } from '../../services/repositories/index.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { OverdueTag, PriorityBadge, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { formatDateId, getTodayIso, isTaskOverdue } from '../../utils/dateUtils.js';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export function CalendarPage() {
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : 'month'));
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);

  const todayIso = getTodayIso();

  const { rangeStartIso, rangeEndIso, gridDays, headerTitle } = useMemo(() => {
    if (view === 'month') {
      const mStart = startOfMonth(cursorDate);
      const mEnd = endOfMonth(cursorDate);
      const gStart = startOfWeek(mStart, { weekStartsOn: 1 });
      const gEnd = endOfWeek(mEnd, { weekStartsOn: 1 });
      const days = [];
      let d = gStart;
      while (d <= gEnd) {
        days.push(d);
        d = addDays(d, 1);
      }
      return {
        rangeStartIso: format(gStart, 'yyyy-MM-dd'),
        rangeEndIso: format(gEnd, 'yyyy-MM-dd'),
        gridDays: days,
        headerTitle: format(cursorDate, 'MMMM yyyy', { locale: idLocale }),
      };
    }

    if (view === 'week') {
      const wStart = startOfWeek(cursorDate, { weekStartsOn: 1 });
      const wEnd = endOfWeek(cursorDate, { weekStartsOn: 1 });
      const days = [];
      let d = wStart;
      while (d <= wEnd) {
        days.push(d);
        d = addDays(d, 1);
      }
      return {
        rangeStartIso: format(wStart, 'yyyy-MM-dd'),
        rangeEndIso: format(wEnd, 'yyyy-MM-dd'),
        gridDays: days,
        headerTitle: `${format(wStart, 'd MMM', { locale: idLocale })} - ${format(wEnd, 'd MMM yyyy', {
          locale: idLocale,
        })}`,
      };
    }

    const iso = format(cursorDate, 'yyyy-MM-dd');
    return {
      rangeStartIso: iso,
      rangeEndIso: iso,
      gridDays: [cursorDate],
      headerTitle: format(cursorDate, 'EEEE, d MMMM yyyy', { locale: idLocale }),
    };
  }, [view, cursorDate]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['calendar', rangeStartIso, rangeEndIso],
    queryFn: () => repo.calendar.getRange(rangeStartIso, rangeEndIso),
  });

  function navigatePeriod(dir) {
    if (view === 'month') setCursorDate((d) => (dir > 0 ? addMonths(d, 1) : subMonths(d, 1)));
    else if (view === 'week') setCursorDate((d) => (dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
    else setCursorDate((d) => (dir > 0 ? addDays(d, 1) : subDays(d, 1)));
  }

  const tasks = data?.tasks || [];
  const sprints = data?.sprints || [];
  const upcoming = data?.upcoming_tasks || [];

  const tasksByDueDay = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!t.due_date) continue;
      if (!map.has(t.due_date)) map.set(t.due_date, []);
      map.get(t.due_date).push(t);
    }
    return map;
  }, [tasks]);

  function sprintsOnDay(dayIso) {
    return sprints.filter((sp) => sp.start_date <= dayIso && sp.end_date >= dayIso);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Task Calendar</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Visualisasi tenggat tugas dan rentang sprint dalam tampilan Bulanan, Mingguan, atau Harian.
          </p>
        </div>
        <Button onClick={() => openQuickAdd({ dueDate: format(cursorDate, 'yyyy-MM-dd') })}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Jadwalkan Tugas</span>
        </Button>
      </header>

      {/* Calendar Controls */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Periode sebelumnya" onClick={() => navigatePeriod(-1)}>
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursorDate(new Date())}>
            Hari Ini
          </Button>
          <Button variant="outline" size="sm" aria-label="Periode berikutnya" onClick={() => navigatePeriod(1)}>
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <h2 className="ml-2 text-sm font-semibold capitalize text-[var(--color-text-primary)] sm:text-base">
            {headerTitle}
          </h2>
        </div>

        <div role="tablist" aria-label="Pilih tampilan kalender" className="flex gap-1.5">
          {[
            { id: 'month', label: 'Bulanan' },
            { id: 'week', label: 'Mingguan' },
            { id: 'day', label: 'Harian' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={view === opt.id}
              onClick={() => setView(opt.id)}
              className={`min-h-[36px] rounded-[var(--radius-sm)] border px-3 text-xs font-semibold transition-colors ${
                view === opt.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-secondary)] text-[var(--color-text-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Memuat jadwal kalender..." rows={4} />
      ) : isError ? (
        <ErrorState title="Gagal memuat kalender" message={error?.message} onRetry={refetch} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Calendar Grid */}
          <div className="lg:col-span-9">
            {/* Active/Visible Sprint Timeline Legend */}
            {sprints.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[var(--color-text-muted)]">Timeline Sprint:</span>
                {sprints.map((sp) => (
                  <Link
                    key={sp.id}
                    to={`/sprints/${sp.id}`}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent-text)] hover:underline"
                  >
                    <Zap className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    <span>
                      {sp.name} ({formatDateId(sp.start_date, 'd MMM')} - {formatDateId(sp.end_date, 'd MMM')})
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {view === 'month' && (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
                    {WEEKDAYS.map((wd) => (
                      <div key={wd} className="px-2.5 py-2 text-center text-xs font-semibold text-[var(--color-text-secondary)]">
                        {wd}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 divide-x divide-y divide-[var(--color-border)]">
                    {gridDays.map((dayObj) => {
                      const dayIso = format(dayObj, 'yyyy-MM-dd');
                      const inMonth = isSameMonth(dayObj, cursorDate);
                      const isToday = dayIso === todayIso;
                      const dayTasks = tasksByDueDay.get(dayIso) || [];
                      const daySprints = sprintsOnDay(dayIso);

                      return (
                        <div
                          key={dayIso}
                          className={`min-h-[112px] p-2 ${inMonth ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-bg)]/60 opacity-70'}`}
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                setCursorDate(dayObj);
                                setView('day');
                              }}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] font-mono-num text-xs font-semibold ${
                                isToday
                                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]'
                              }`}
                            >
                              {format(dayObj, 'd')}
                            </button>
                            <button
                              type="button"
                              aria-label={`Tambah tugas pada ${dayIso}`}
                              onClick={() => openQuickAdd({ dueDate: dayIso })}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          </div>

                          {/* Sprint timeline band indicator */}
                          {daySprints.slice(0, 1).map((sp) => (
                            <div
                              key={sp.id}
                              title={sp.name}
                              className="mt-1 truncate rounded-[3px] bg-[var(--color-surface-warm)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent-text)]"
                            >
                              {sp.name}
                            </div>
                          ))}

                          <div className="mt-1.5 space-y-1">
                            {dayTasks.slice(0, 2).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => openTaskDrawer(t.id)}
                                className={`block w-full truncate rounded-[4px] border px-1.5 py-0.5 text-left text-[11px] font-medium ${
                                  t.semantic_type === 'done'
                                    ? 'border-[var(--color-border)] bg-[var(--color-bg)] line-through text-[var(--color-text-muted)]'
                                    : 'border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]'
                                }`}
                              >
                                {t.title}
                              </button>
                            ))}
                            {dayTasks.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCursorDate(dayObj);
                                  setView('day');
                                }}
                                className="text-[11px] font-semibold text-[var(--color-accent-text)] hover:underline"
                              >
                                +{dayTasks.length - 2} lainnya
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {view === 'week' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
                {gridDays.map((dayObj) => {
                  const dayIso = format(dayObj, 'yyyy-MM-dd');
                  const isToday = dayIso === todayIso;
                  const dayTasks = tasksByDueDay.get(dayIso) || [];
                  const daySprints = sprintsOnDay(dayIso);
                  return (
                    <section
                      key={dayIso}
                      className={`rounded-[var(--radius-md)] border p-3 ${
                        isToday
                          ? 'border-[var(--color-primary)] bg-[var(--color-surface-elevated)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCursorDate(dayObj);
                            setView('day');
                          }}
                          className="text-left"
                        >
                          <p className="text-[11px] uppercase text-[var(--color-text-muted)]">
                            {format(dayObj, 'EEE', { locale: idLocale })}
                          </p>
                          <p className="font-mono-num text-sm font-semibold text-[var(--color-text-primary)]">
                            {format(dayObj, 'd MMM', { locale: idLocale })}
                          </p>
                        </button>
                        <button
                          type="button"
                          aria-label={`Tambah tugas pada ${dayIso}`}
                          onClick={() => openQuickAdd({ dueDate: dayIso })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </div>

                      {daySprints.map((sp) => (
                        <div
                          key={sp.id}
                          className="mt-2 truncate rounded-[var(--radius-sm)] bg-[var(--color-surface-warm)] px-2 py-1 text-[10px] font-medium text-[var(--color-accent-text)]"
                        >
                          {sp.name}
                        </div>
                      ))}

                      <div className="mt-2.5 space-y-1.5">
                        {dayTasks.length === 0 ? (
                          <p className="text-[11px] text-[var(--color-text-muted)]">Kosong</p>
                        ) : (
                          dayTasks.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => openTaskDrawer(t.id)}
                              className="block w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-left text-xs font-medium text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                            >
                              {t.title}
                            </button>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {view === 'day' && (
              <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold capitalize text-[var(--color-text-primary)]">
                      {headerTitle}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sprintsOnDay(rangeStartIso).map((sp) => (
                        <StatusBadge key={sp.id} tone="accent">
                          Sprint: {sp.name}
                        </StatusBadge>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => openQuickAdd({ dueDate: rangeStartIso })}>
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>Tambah di Tanggal Ini</span>
                  </Button>
                </div>

                {(tasksByDueDay.get(rangeStartIso) || []).length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="Tidak ada tenggat tugas pada tanggal ini"
                    description="Klik tombol di atas untuk menjadwalkan tugas pada tanggal ini."
                  />
                ) : (
                  <ul className="divide-y divide-[var(--color-border)]">
                    {(tasksByDueDay.get(rangeStartIso) || []).map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0 space-y-1">
                          <button
                            type="button"
                            onClick={() => openTaskDrawer(t.id)}
                            className="text-left text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent-text)] hover:underline"
                          >
                            {t.title}
                          </button>
                          <div className="flex flex-wrap gap-1.5">
                            <PriorityBadge priority={t.priority} />
                            <StatusBadge>{t.column_name}</StatusBadge>
                            {isTaskOverdue(t.due_date, t.semantic_type) && <OverdueTag />}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => openTaskDrawer(t.id)}>
                          Detail
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          {/* Upcoming Deadlines Panel */}
          <aside className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-3">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Upcoming Tasks</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">Tenggat 14 hari ke depan.</p>

            {upcoming.length === 0 ? (
              <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                Tidak ada tenggat tugas dalam 14 hari ke depan.
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {upcoming.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                  >
                    <button
                      type="button"
                      onClick={() => openTaskDrawer(t.id)}
                      className="text-left text-xs font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-accent-text)]"
                    >
                      {t.title}
                    </button>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                      <span>{formatDateId(t.due_date, 'd MMM')}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
