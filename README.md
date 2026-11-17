# TASKLY

Smart Productivity & Workflow Management Platform berbasis web yang menggabungkan **Kanban Board**, **Sprint Management**, **Focus Mode**, **Task Calendar**, dan **Analytics** dalam satu ruang kerja.

## Stack & Mode Penyimpanan

- **Frontend**: React 19, Vite 6, JavaScript (ESM), Tailwind CSS v4, Lucide Icons (`strokeWidth={1.75}`), Zustand, TanStack Query, dnd-kit, Recharts, date-fns, Sonner
- **Penyimpanan Default**: **Browser `localStorage`** (`src/services/repositories/localStorageAdapter.js`), langsung terbuka ke workspace tanpa perlu login maupun menjalankan server database.
- **Adapter Opsional (Jika Diaktifkan Nanti)**:
  - **Local API + SQLite**: Jalankan `npm run dev:full` dengan environment `VITE_USE_API=true`.
  - **Supabase Cloud**: Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (skema PostgreSQL + RLS tersedia di `supabase/migrations/001_initial_schema.sql`).

## Cara Menjalankan Aplikasi

1. Pasang dependensi (jika belum):
   ```bash
   npm install
   ```
2. Jalankan aplikasi (langsung terbuka ke Dashboard tanpa login):
   ```bash
   npm run dev
   ```
   Buka `http://localhost:5173` di browser Anda.
3. Atau build produksi & preview:
   ```bash
   npm run build
   npm run preview
   ```

## Pengujian

- Jalankan unit, komponen, adapter `localStorage`, dan integrasi API:
  ```bash
  npm test
  ```
- Jalankan pengujian End-to-End browser Chrome (Desktop & Mobile 375px):
  ```bash
  npm run test:e2e
  ```

## Referensi Dokumen

- Product Requirements Document (PRD): [docs/PRD.md](./docs/PRD.md)
- Skema PostgreSQL + RLS Supabase: [supabase/migrations/001_initial_schema.sql](./supabase/migrations/001_initial_schema.sql)
