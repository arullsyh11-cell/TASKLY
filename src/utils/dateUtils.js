import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(dateIso, delta) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = addDays(new Date(y, m - 1, d), delta);
  return format(dt, 'yyyy-MM-dd');
}

export function dateRangeDays(startIso, endIso) {
  const days = [];
  let curr = startIso;
  let guard = 0;
  while (curr <= endIso && guard < 366) {
    days.push(curr);
    curr = addDaysIso(curr, 1);
    guard += 1;
  }
  return days;
}

export function formatDateId(dateStr, pattern = 'd MMM yyyy') {
  if (!dateStr) return '-';
  try {
    const clean = dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr;
    return format(parseISO(clean), pattern, { locale: idLocale });
  } catch {
    return dateStr;
  }
}

export function formatRelativeDateTime(isoString) {
  if (!isoString) return '-';
  try {
    return format(parseISO(isoString), 'd MMM yyyy, HH:mm', { locale: idLocale });
  } catch {
    return isoString;
  }
}

export function isTaskOverdue(dueDate, semanticType) {
  if (!dueDate || semanticType === 'done') return false;
  return dueDate < getTodayIso();
}

export function daysRemaining(endDateIso, fromDateIso = getTodayIso()) {
  if (!endDateIso) return 0;
  const today = parseISO(`${fromDateIso}T00:00:00`);
  const end = parseISO(`${endDateIso}T00:00:00`);
  return differenceInCalendarDays(end, today);
}

export function formatSecondsClock(totalSeconds) {
  const clamped = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationHuman(totalSeconds) {
  const mins = Math.round((totalSeconds || 0) / 60);
  if (mins < 60) return `${mins} mnt`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}
