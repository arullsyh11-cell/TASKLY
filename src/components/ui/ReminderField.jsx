import { useEffect, useId, useState } from 'react';
import { Bell } from 'lucide-react';
import { Dropdown } from './Dropdown.jsx';
import { formatDateId, getTodayIso } from '../../utils/dateUtils.js';
import {
  REMINDER_PRESET_NUMBERS,
  REMINDER_PRESETS,
  clampReminderDays,
  getTaskReminderDateIso,
} from '../../utils/reminderUtils.js';

export function ReminderField({
  dueDate = '',
  value,
  defaultDays = 1,
  onChange,
  disabled = false,
  label = 'Pengingat Deadline (Reminder)',
}) {
  const customInputId = useId();
  const normalizedValue = value === undefined ? defaultDays : value;
  const isCustomInitial =
    normalizedValue !== null &&
    normalizedValue !== undefined &&
    !REMINDER_PRESET_NUMBERS.has(Number(normalizedValue));

  const [customOpen, setCustomOpen] = useState(isCustomInitial);

  useEffect(() => {
    if (
      normalizedValue !== null &&
      normalizedValue !== undefined &&
      !REMINDER_PRESET_NUMBERS.has(Number(normalizedValue))
    ) {
      setCustomOpen(true);
    } else if (normalizedValue === null) {
      setCustomOpen(false);
    }
  }, [normalizedValue]);

  const selectValue =
    normalizedValue === null
      ? 'off'
      : customOpen || !REMINDER_PRESET_NUMBERS.has(Number(normalizedValue))
      ? 'custom'
      : String(normalizedValue);

  const numericValue = normalizedValue === null ? defaultDays : clampReminderDays(normalizedValue, defaultDays);
  const triggerIso = dueDate && normalizedValue !== null ? getTaskReminderDateIso(dueDate, numericValue) : null;
  const todayIso = getTodayIso();

  function handlePresetChange(nextOpt) {
    if (nextOpt === 'off') {
      setCustomOpen(false);
      onChange(null);
      return;
    }
    if (nextOpt === 'custom') {
      setCustomOpen(true);
      onChange(clampReminderDays(normalizedValue, defaultDays));
      return;
    }
    setCustomOpen(false);
    onChange(Number(nextOpt));
  }

  return (
    <div className="space-y-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
        <Dropdown
          label={label}
          value={selectValue}
          disabled={disabled}
          onChange={handlePresetChange}
          options={REMINDER_PRESETS}
        />

        {(selectValue === 'custom' || customOpen) && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={customInputId} className="text-xs font-medium text-[var(--color-text-secondary)]">
              Custom Hari Sebelum Deadline
            </label>
            <div className="flex items-center gap-2">
              <input
                id={customInputId}
                type="number"
                min={0}
                max={60}
                disabled={disabled}
                value={numericValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onChange(0);
                    return;
                  }
                  onChange(clampReminderDays(raw, 1));
                }}
                className="min-h-[42px] w-24 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-center font-mono-num text-base sm:text-sm text-[var(--color-text-primary)]"
              />
              <span className="text-xs text-[var(--color-text-secondary)]">hari sebelum tenggat</span>
            </div>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
        <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
        <span>
          {normalizedValue === null ? (
            'Pengingat dimatikan untuk tugas ini.'
          ) : !dueDate ? (
            `Jadwal pengingat siap di ${numericValue === 0 ? 'Hari H' : `${numericValue} hari sebelum deadline`}. Isi Tenggat Waktu agar pengingat aktif otomatis.`
          ) : triggerIso && triggerIso <= todayIso ? (
            `Pengingat aktif segera: notifikasi pengingat untuk deadline ${formatDateId(dueDate, 'd MMMM yyyy')} akan muncul hari ini.`
          ) : (
            `Notifikasi pengingat akan muncul mulai ${formatDateId(triggerIso, 'd MMMM yyyy')} (${
              numericValue === 0 ? 'tepat di tanggal deadline' : `${numericValue} hari sebelum deadline`
            }).`
          )}
        </span>
      </p>
    </div>
  );
}
