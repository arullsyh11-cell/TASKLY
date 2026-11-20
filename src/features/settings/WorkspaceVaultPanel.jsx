import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  Eye,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Image as ImageIcon,
  Pin,
  PinOff,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes, vaultService } from '../../services/vaultService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { formatDateId, formatRelativeDateTime } from '../../utils/dateUtils.js';

function isImageMime(mime = '', name = '') {
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
}

function isTextMime(mime = '', name = '') {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|json|csv|xml|html|css|js|jsx|ts|tsx|log|yml|yaml)$/i.test(name)
  );
}

function decodeDataUrlText(dataUrl = '') {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return '';
    const header = dataUrl.slice(0, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    if (header.includes(';base64')) {
      const binary = atob(body);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return 'Unable to decode file preview.';
  }
}

export function WorkspaceVaultPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Files & Folders UI state
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [fileSearch, setFileSearch] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [moveFileTarget, setMoveFileTarget] = useState(null);
  const [moveDestFolderId, setMoveDestFolderId] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Quick Notes UI state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [notePinned, setNotePinned] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteTitle, setEditNoteTitle] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');

  const {
    data: vault = { folders: [], files: [], notes: [], totalBytes: 0 },
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['vault'],
    queryFn: () => vaultService.list(),
  });

  const invalidateVault = () => queryClient.invalidateQueries({ queryKey: ['vault'] });

  const createFolderMutation = useMutation({
    mutationFn: () => vaultService.createFolder({ name: newFolderName, parentId: currentFolderId }),
    onSuccess: (created) => {
      invalidateVault();
      setNewFolderName('');
      setCreatingFolder(false);
      toast.success(`Folder "${created.name}" created.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }) => vaultService.renameFolder(id, name),
    onSuccess: () => {
      invalidateVault();
      setRenamingFolderId(null);
      setRenameDraft('');
      toast.success('Folder renamed.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id) => vaultService.deleteFolder(id),
    onSuccess: (_res, deletedId) => {
      invalidateVault();
      if (currentFolderId === deletedId) setCurrentFolderId(null);
      setDeleteFolderTarget(null);
      toast.success('Folder deleted.');
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadFilesMutation = useMutation({
    mutationFn: (fileList) => vaultService.uploadFiles(fileList, currentFolderId),
    onSuccess: ({ addedFiles, createdFolders, skipped }) => {
      invalidateVault();
      if (addedFiles.length > 0) {
        const folderMsg = createdFolders > 0 ? ` across ${createdFolders} new folder(s)` : '';
        toast.success(`Saved ${addedFiles.length} file(s)${folderMsg}.`);
      }
      if (skipped.length > 0) {
        toast.warning(`Skipped ${skipped.length} file(s): ${skipped[0]}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const moveFileMutation = useMutation({
    mutationFn: ({ fileId, folderId }) => vaultService.moveFile(fileId, folderId || null),
    onSuccess: () => {
      invalidateVault();
      setMoveFileTarget(null);
      toast.success('File moved.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (id) => vaultService.deleteFile(id),
    onSuccess: () => {
      invalidateVault();
      toast.success('File removed.');
    },
    onError: (err) => toast.error(err.message),
  });

  const createNoteMutation = useMutation({
    mutationFn: () => vaultService.createNote({ title: noteTitle, content: noteContent, pinned: notePinned }),
    onSuccess: () => {
      invalidateVault();
      setNoteTitle('');
      setNoteContent('');
      setNotePinned(false);
      toast.success('Quick note saved.');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, patch }) => vaultService.updateNote(id, patch),
    onSuccess: () => {
      invalidateVault();
      setEditingNoteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => vaultService.deleteNote(id),
    onSuccess: () => {
      invalidateVault();
      toast.success('Note deleted.');
    },
    onError: (err) => toast.error(err.message),
  });

  const folderMap = useMemo(() => new Map(vault.folders.map((f) => [f.id, f])), [vault.folders]);

  const breadcrumbs = useMemo(() => {
    const chain = [];
    let cursor = currentFolderId;
    let guard = 0;
    while (cursor && folderMap.has(cursor) && guard < 12) {
      const f = folderMap.get(cursor);
      chain.unshift(f);
      cursor = f.parent_id;
      guard += 1;
    }
    return chain;
  }, [currentFolderId, folderMap]);

  const isSearchingFiles = fileSearch.trim().length > 0;
  const visibleFolders = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (q) {
      return vault.folders.filter((f) => f.name.toLowerCase().includes(q));
    }
    return vault.folders.filter((f) => (f.parent_id || null) === (currentFolderId || null));
  }, [vault.folders, currentFolderId, fileSearch]);

  const visibleFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (q) {
      return vault.files.filter((f) => f.name.toLowerCase().includes(q));
    }
    return vault.files.filter((f) => (f.folder_id || null) === (currentFolderId || null));
  }, [vault.files, currentFolderId, fileSearch]);

  const visibleNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    if (!q) return vault.notes;
    return vault.notes.filter(
      (n) => n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)
    );
  }, [vault.notes, noteSearch]);

  function countItemsInFolder(folderId) {
    const subFolders = vault.folders.filter((f) => f.parent_id === folderId).length;
    const subFiles = vault.files.filter((f) => f.folder_id === folderId).length;
    return subFolders + subFiles;
  }

  function handleDownloadFile(file) {
    const a = document.createElement('a');
    a.href = file.data_url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleCopyNote(note) {
    const text = note.content ? `${note.title}\n${note.content}` : note.title;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Note copied to clipboard.');
    } catch {
      toast.info('Clipboard access is unavailable in this browser.');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (dropped.length > 0) {
      uploadFilesMutation.mutate(dropped);
    }
  }

  const moveFolderOptions = [
    { value: '', label: 'All Files (Root)' },
    ...vault.folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  if (isLoading) {
    return <LoadingState label="Loading workspace files and quick notes..." rows={4} />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load Files & Notes"
        message={error?.message || 'Unable to read local browser storage for your files and notes.'}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Column: Files & Folders Organizer */}
      <section
        aria-label="Workspace files and folders"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col rounded-[var(--radius-lg)] border bg-[var(--color-surface)] p-5 transition-colors lg:col-span-7 ${
          dragOver ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)]/35' : 'border-[var(--color-border)]'
        }`}
      >
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Files &amp; Folders</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Organize reference files and folders locally ({vault.folders.length}{' '}
              {vault.folders.length === 1 ? 'folder' : 'folders'}, {vault.files.length}{' '}
              {vault.files.length === 1 ? 'file' : 'files'}, {formatBytes(vault.totalBytes)} used).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreatingFolder((v) => !v)}
              className="rounded-full"
            >
              <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>New Folder</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => folderInputRef.current?.click()}
              className="rounded-full"
            >
              <FolderUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>Upload Folder</span>
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              isLoading={uploadFilesMutation.isPending}
              className="rounded-full"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>Upload Files</span>
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              aria-label="Choose files to upload"
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                if (picked.length > 0) uploadFilesMutation.mutate(picked);
                e.target.value = '';
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              webkitdirectory=""
              directory=""
              aria-label="Choose folder to upload"
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                if (picked.length > 0) uploadFilesMutation.mutate(picked);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* Inline New Folder Bar */}
        {creatingFolder && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolderName.trim()) createFolderMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)]/40 p-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <label
                htmlFor="vault-new-folder-name"
                className="block text-[11px] font-medium text-[var(--color-text-secondary)]"
              >
                Folder Name
              </label>
              <input
                id="vault-new-folder-name"
                type="text"
                placeholder="Folder name (e.g. Design Assets)..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                className="min-h-[44px] sm:min-h-[40px] w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-base sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="submit" size="sm" isLoading={createFolderMutation.isPending}>
                Create Folder
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreatingFolder(false);
                  setNewFolderName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Breadcrumb & Search Row */}
        <div className="mt-4 flex flex-col gap-2.5 border-b border-[var(--color-border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className={`rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors ${
                currentFolderId === null
                  ? 'bg-[var(--color-secondary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              All Files
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.id} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(crumb.id)}
                  className={`max-w-[140px] truncate rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors ${
                    idx === breadcrumbs.length - 1
                      ? 'bg-[var(--color-secondary)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="relative w-full sm:w-52">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search files and folders"
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Search files or folders..."
              className="h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-3 text-base sm:text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
        </div>

        {/* Folder & File List */}
        <div className="mt-4 flex-1 space-y-2.5">
          {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={isSearchingFiles ? 'No matching files or folders' : 'This folder is empty'}
              description={
                isSearchingFiles
                  ? 'Try another keyword or clear the search input.'
                  : 'Create a folder, upload files (up to 2 MB each), or drag and drop files directly into this area.'
              }
              action={
                !isSearchingFiles ? (
                  <Button size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-full">
                    <Upload className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>Upload Files</span>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setFileSearch('')}>
                    Clear Search
                  </Button>
                )
              }
              secondaryAction={
                !isSearchingFiles ? (
                  <Button size="sm" variant="outline" onClick={() => setCreatingFolder(true)} className="rounded-full">
                    <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>New Folder</span>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {visibleFolders.map((folder) => {
                const itemCount = countItemsInFolder(folder.id);
                const isRenaming = renamingFolderId === folder.id;
                return (
                  <li
                    key={folder.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5 transition-colors hover:border-[var(--color-border-strong)]"
                  >
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (renameDraft.trim()) renameFolderMutation.mutate({ id: folder.id, name: renameDraft });
                        }}
                        className="flex flex-1 items-center gap-2"
                      >
                        <input
                          type="text"
                          aria-label="Rename folder"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          autoFocus
                          className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-text-primary)]"
                        />
                        <Button type="submit" size="sm">
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRenamingFolderId(null);
                            setRenameDraft('');
                          }}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentFolderId(folder.id);
                            setFileSearch('');
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] text-[var(--color-accent-text)]">
                            <Folder className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                              {folder.name}
                            </p>
                            <p className="text-[11px] text-[var(--color-text-muted)]">
                              {itemCount} {itemCount === 1 ? 'item' : 'items'}
                            </p>
                          </div>
                        </button>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingFolderId(folder.id);
                              setRenameDraft(folder.name);
                            }}
                            aria-label={`Rename folder ${folder.name}`}
                            title="Rename folder"
                            className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                          >
                            <Edit2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteFolderTarget(folder)}
                            aria-label={`Delete folder ${folder.name}`}
                            title="Delete folder"
                            className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}

              {visibleFiles.map((file) => {
                const canPreview = isImageMime(file.mime_type, file.name) || isTextMime(file.mime_type, file.name);
                const FileIcon = isImageMime(file.mime_type, file.name)
                  ? ImageIcon
                  : isTextMime(file.mime_type, file.name)
                  ? FileText
                  : File;
                const parentName = file.folder_id ? folderMap.get(file.folder_id)?.name : null;

                return (
                  <li
                    key={file.id}
                    className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5 transition-colors hover:border-[var(--color-border-strong)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                        <FileIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{file.name}</p>
                        <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                          {formatBytes(file.size)} | {formatDateId(file.created_at)}
                          {isSearchingFiles && parentName ? ` | in ${parentName}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-1 border-t border-[var(--color-border)]/60 pt-1.5 sm:border-t-0 sm:pt-0">
                      {canPreview && (
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          aria-label={`Preview ${file.name}`}
                          title="Preview"
                          className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                        >
                          <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      )}
                      {vault.folders.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setMoveFileTarget(file);
                            setMoveDestFolderId(file.folder_id || '');
                          }}
                          aria-label={`Move ${file.name} to folder`}
                          title="Move to folder"
                          className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                        >
                          <Folder className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(file)}
                        aria-label={`Download ${file.name}`}
                        title="Download"
                        className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFileMutation.mutate(file.id)}
                        aria-label={`Delete file ${file.name}`}
                        title="Delete"
                        className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Right Column: Quick Notes Scratchpad */}
      <section
        aria-label="Workspace quick notes"
        className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-5"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Quick Notes</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Save short scratchpad notes, links, or quick reminders.
            </p>
          </div>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-0.5 font-mono-num text-[11px] font-semibold text-[var(--color-text-secondary)]">
            {vault.notes.length}
          </span>
        </div>

        {/* Quick Note Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createNoteMutation.mutate();
          }}
          className="mt-4 space-y-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5"
        >
          <div className="space-y-1">
            <label
              htmlFor="vault-note-title"
              className="block text-[11px] font-medium text-[var(--color-text-secondary)]"
            >
              Note Title (optional)
            </label>
            <input
              id="vault-note-title"
              type="text"
              placeholder="e.g. Sprint release notes..."
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="min-h-[44px] sm:min-h-[38px] w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base sm:text-sm font-medium text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="vault-note-body"
              className="block text-[11px] font-medium text-[var(--color-text-secondary)]"
            >
              Quick Note
            </label>
            <textarea
              id="vault-note-body"
              placeholder="Write a quick note..."
              rows={3}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setNotePinned((v) => !v)}
              aria-pressed={notePinned}
              className={`inline-flex min-h-[44px] sm:min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                notePinned
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)] text-[var(--color-accent-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Pin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>{notePinned ? 'Pinned' : 'Pin Note'}</span>
            </button>

            <Button type="submit" size="sm" isLoading={createNoteMutation.isPending} className="rounded-full px-4">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>Save Note</span>
            </Button>
          </div>
        </form>

        {/* Note Search (when 3+ notes exist) */}
        {vault.notes.length >= 3 && (
          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search quick notes"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              placeholder="Filter notes..."
              className="h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-3 text-base sm:text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
        )}

        {/* Saved Notes List */}
        <div className="mt-4 flex-1 space-y-2.5">
          {visibleNotes.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title={noteSearch.trim() ? 'No matching notes' : 'No quick notes yet'}
              description={
                noteSearch.trim()
                  ? 'Try another search term to find your note.'
                  : 'Use the scratchpad above to keep short reminders, links, or meeting snippets close at hand.'
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {visibleNotes.map((note) => {
                const isEditing = editingNoteId === note.id;
                return (
                  <li
                    key={note.id}
                    className={`rounded-[var(--radius-md)] border p-3.5 transition-colors ${
                      note.pinned
                        ? 'border-[var(--color-border-warm)] bg-[var(--color-surface-warm)]/45'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          aria-label="Edit note title"
                          value={editNoteTitle}
                          onChange={(e) => setEditNoteTitle(e.target.value)}
                          className="min-h-[38px] w-full rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-surface)] px-2.5 text-sm font-medium text-[var(--color-text-primary)]"
                        />
                        <textarea
                          aria-label="Edit note content"
                          rows={3}
                          value={editNoteContent}
                          onChange={(e) => setEditNoteContent(e.target.value)}
                          className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm text-[var(--color-text-primary)]"
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>
                            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            <span>Cancel</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              updateNoteMutation.mutate({
                                id: note.id,
                                patch: { title: editNoteTitle, content: editNoteContent },
                              })
                            }
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            <span>Save</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {note.pinned && (
                                <Pin className="h-3 w-3 shrink-0 text-[var(--color-accent-text)]" strokeWidth={2} aria-hidden="true" />
                              )}
                              <h3 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                                {note.title}
                              </h3>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateNoteMutation.mutate({ id: note.id, patch: { pinned: !note.pinned } })
                              }
                              aria-label={note.pinned ? `Unpin note ${note.title}` : `Pin note ${note.title}`}
                              title={note.pinned ? 'Unpin' : 'Pin'}
                              className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent-text)]"
                            >
                              {note.pinned ? (
                                <PinOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyNote(note)}
                              aria-label={`Copy note ${note.title}`}
                              title="Copy"
                              className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                            >
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditNoteTitle(note.title);
                                setEditNoteContent(note.content);
                              }}
                              aria-label={`Edit note ${note.title}`}
                              title="Edit"
                              className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                            >
                              <Edit2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteNoteMutation.mutate(note.id)}
                              aria-label={`Delete note ${note.title}`}
                              title="Delete"
                              className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {note.content && (
                          <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--color-text-secondary)]">
                            {note.content}
                          </p>
                        )}
                        <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
                          Updated {formatRelativeDateTime(note.updated_at)}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* File Preview Modal */}
      <Modal
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.name || 'File Preview'}
        subtitle={previewFile ? `${formatBytes(previewFile.size)} | ${previewFile.mime_type}` : undefined}
        maxWidth="max-w-2xl"
      >
        {previewFile && (
          <div className="space-y-4">
            {isImageMime(previewFile.mime_type, previewFile.name) ? (
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
                <img
                  src={previewFile.data_url}
                  alt={previewFile.name}
                  width={800}
                  height={500}
                  className="mx-auto max-h-[60dvh] w-auto rounded-[var(--radius-sm)] object-contain"
                />
              </div>
            ) : (
              <pre className="max-h-[55dvh] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-xs leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
                {decodeDataUrlText(previewFile.data_url)}
              </pre>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreviewFile(null)}>
                Close
              </Button>
              <Button onClick={() => handleDownloadFile(previewFile)}>
                <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Download</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Move File Modal */}
      <Modal
        open={Boolean(moveFileTarget)}
        onClose={() => setMoveFileTarget(null)}
        title="Move File to Folder"
        subtitle={moveFileTarget?.name}
      >
        <div className="space-y-4">
          <Dropdown
            label="Destination Folder"
            value={moveDestFolderId}
            onChange={setMoveDestFolderId}
            options={moveFolderOptions}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoveFileTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                moveFileMutation.mutate({ fileId: moveFileTarget.id, folderId: moveDestFolderId || null })
              }
            >
              Move File
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Folder Confirmation */}
      <ConfirmationDialog
        open={Boolean(deleteFolderTarget)}
        onClose={() => setDeleteFolderTarget(null)}
        onConfirm={() => deleteFolderMutation.mutate(deleteFolderTarget.id)}
        isLoading={deleteFolderMutation.isPending}
        title={`Delete Folder "${deleteFolderTarget?.name || ''}"?`}
        description="This folder and any subfolders or files stored inside it will be permanently removed from your local browser storage."
        confirmLabel="Delete Folder"
      />
    </div>
  );
}
