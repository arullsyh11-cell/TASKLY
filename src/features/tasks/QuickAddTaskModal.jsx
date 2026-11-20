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
    title: z.string().trim().min(1, 'Task title is required.').max(160, 'Maximum 160 characters.'),
    description: z.string().optional(),
    column_id: z.string().min(1, 'Status column is required.'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    category_id: z.string().optional(),
    sprint_id: z.string().optional(),
    start_date: z.string().optional(),
    due_date: z.string().optional(),
    reminder_days_before: z.number().int().min(0).max(60).nullable().optional(),
  })
  .refine(
    (vals) => !vals.start_date || !vals.due_date || vals.due_date >= vals.start_date,
    { message: 'Start date cannot be after the due date.', path: ['due_date'] }
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
      toast.success('New task created.');
      closeQuickAdd();
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to create task.');
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
    { value: '', label: 'No category' },
    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
  ];
  const sprintOptions = [
    { value: '', label: 'Backlog (No Sprint)' },
    ...sprints
      .filter((sp) => sp.status === 'active' || sp.status === 'planned')
      .map((sp) => ({
        value: sp.id,
        label: sp.name,
        hint: sp.status === 'active' ? 'Active Sprint' : 'Planned',
      })),
  ];

  return (
    <Modal open={open} onClose={closeQuickAdd} title="Create New Task" subtitle="Add a task to your board and sprint.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Task Title"
          placeholder="e.g. Implement sprint form validation"
          error={errors.title?.message}
          {...register('title')}
        />

        <Textarea
          label="Description (Optional)"
          placeholder="Technical notes, context, or acceptance criteria..."
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
                label="Status Column"
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
                label="Priority"
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
                label="Category"
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
                label="Assign to Sprint"
                value={field.value}
                onChange={field.onChange}
                options={sprintOptions}
              />
            )}
          />

          <Input label="Start Date" type="date" error={errors.start_date?.message} {...register('start_date')} />
          <Input label="Due Date" type="date" error={errors.due_date?.message} {...register('due_date')} />
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
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Save Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
