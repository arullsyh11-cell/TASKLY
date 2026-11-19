-- Incremental migration for deadline reminders and navigation preferences

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder_days_before int DEFAULT 1
  CHECK (reminder_days_before IS NULL OR (reminder_days_before BETWEEN 0 AND 60));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS default_reminder_days int NOT NULL DEFAULT 1
  CHECK (default_reminder_days BETWEEN 0 AND 60);

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS nav_style text NOT NULL DEFAULT 'radial'
  CHECK (nav_style IN ('radial', 'sidebar'));
