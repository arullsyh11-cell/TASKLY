import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal } from '../../components/ui/Modal.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { ReminderField } from '../../components/ui/ReminderField.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useUiStore } from '../../stores/useUiStore.js';
import { repo } from '../../services/repositories/index.js';

const schema = z
  .object({
    title: z.string().trim().min(1, 'Judul tugas wajib diisi.').max(160, 'Maksimal 160 karakter.'),
    description: z.string().optional(),
    column_id: z.string().min(1, 'Kolom status wajib dipilih.'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    category_id: z.string().optional(),
    sprint_id: z.string().optional(),
    start_date: z.string().optional(),
    due_date: z.string().optional(),
    reminder_days_before: z.number().int().min(0).max(60).nullable().optional(),
  })
  .refine(
    (vals) => !vals.start_date || !vals.due_date || vals.due_date >= vals.start_date,
    { message: 'Tanggal mulai tidak boleh melewati tenggat waktu.', path: ['due_date'] }
  );

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function QuickAddTaskModal() {
  const open = useUiStore((s) => s.quickAddOpen);
  const defaults = useUiStore((s) => s.quickAddDefaults);
  const closeQuickAdd = useUiStore((s) => s.closeQuickAdd);
  const queryClient = useQueryClient();

  const { data: columns = [] } = useQuery({
    queryKey: ['columns'],
    queryFn: () => repo.columns.list(),
    enabled: open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => repo.taxonomy.listCategories(),
    enabled: open,
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints'],
    queryFn: () => repo.sprints.list(),
    enabled: open,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => repo.settings.get(),
    enabled: open,
  });

  const defaultReminderDays = settings?.default_reminder_days ?? 1;
  const defaultTodoCol = columns.find((c) => c.semantic_type === 'todo')?.id || columns[0]?.id || '';

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      column_id: '',
      priority: 'medium',
      category_id: '',
      sprint_id: '',
      start_date: '',
      due_date: '',
      reminder_days_before: 1,
    },
  });

  const watchedDueDate = watch('due_date');

  useEffect(() => {
    if (open) {
      reset({
        title: '',
        description: '',
        column_id: defaults.columnId || defaultTodoCol,
        priority: 'medium',
        category_id: '',
        sprint_id: defaults.sprintId || '',
        start_date: '',
        due_date: defaults.dueDate || '',
        reminder_days_before: defaultReminderDays,
      });
    }
  }, [open, defaults, defaultTodoCol, defaultReminderDays, reset]);

  const mutation = useMutation({
    mutationFn: (payload) => repo.tasks.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      queryClient.invalidateQueries({ queryKey: ['sprint'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('Tugas baru berhasil ditambahkan.');
      closeQuickAdd();
    },
    onError: (err) => {
      toast.error(err.message || 'Gagal membuat tugas.');
    },
  });

  function onSubmit(values) {
    mutation.mutate({
      ...values,
      category_id: values.category_id || null,
      sprint_id: values.sprint_id || null,
      start_date: values.start_date || null,
      due_date: values.due_date || null,
      reminder_days_before: values.reminder_days_before === undefined ? defaultReminderDays : values.reminder_days_before,
    });
  }

  const columnOptions = columns.map((col) => ({ value: col.id, label: col.name }));
  const categoryOptions = [
    { value: '', label: 'Tanpa kategori' },
    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
  ];
  const sprintOptions = [
    { value: '', label: 'Backlog (Tanpa Sprint)' },
    ...sprints
      .filter((sp) => sp.status === 'active' || sp.status === 'planned')
      .map((sp) => ({
        value: sp.id,
        label: sp.name,
        hint: sp.status === 'active' ? 'Sprint Aktif' : 'Terencana',
      })),
  ];

  return (
    <Modal open={open} onClose={closeQuickAdd} title="Buat Tugas Baru" subtitle="Tambahkan tugas ke papan kerja dan sprint Anda.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Judul Tugas"
          placeholder="Mis. Implementasi validasi form sprint"
          error={errors.title?.message}
          {...register('title')}
        />

        <Textarea
          label="Deskripsi (Opsional)"
          placeholder="Catatan teknis, konteks, atau target penyelesaian..."
          rows={3}
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Controller
            name="column_id"
            control={control}
            render={({ field }) => (
              <Dropdown
                label="Status Kolom"
                value={field.value}
                onChange={field.onChange}
                options={columnOptions}
                error={errors.column_id?.message}
              />
            )}
          />

          <Controller
            name="priority"
            control={control}
            render={({ field }) => (
              <Dropdown
                label="Prioritas"
                value={field.value}
                onChange={field.onChange}
                options={PRIORITY_OPTIONS}
                error={errors.priority?.message}
              />
            )}
          />

          <Controller
            name="category_id"
            control={control}
            render={({ field }) => (
              <Dropdown
                label="Kategori"
                value={field.value}
                onChange={field.onChange}
                options={categoryOptions}
              />
            )}
          />

          <Controller
            name="sprint_id"
            control={control}
            render={({ field }) => (
              <Dropdown
                label="Assign ke Sprint"
                value={field.value}
                onChange={field.onChange}
                options={sprintOptions}
              />
            )}
          />

          <Input label="Tanggal Mulai" type="date" error={errors.start_date?.message} {...register('start_date')} />
          <Input label="Tenggat Waktu (Due Date)" type="date" error={errors.due_date?.message} {...register('due_date')} />
        </div>

        <Controller
          name="reminder_days_before"
          control={control}
          render={({ field }) => (
            <ReminderField
              dueDate={watchedDueDate}
              value={field.value}
              defaultDays={defaultReminderDays}
              onChange={field.onChange}
            />
          )}
        />

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={closeQuickAdd}>
            Batal
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Simpan Tugas
          </Button>
        </div>
      </form>
    </Modal>
  );
}
