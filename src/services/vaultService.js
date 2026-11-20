const VAULT_STORAGE_KEY = 'taskly_vault_v1';
export const MAX_VAULT_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per file
export const MAX_VAULT_TOTAL_BYTES = 4.2 * 1024 * 1024; // ~4.2 MB safe localStorage budget

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `vault_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyVault() {
  return {
    folders: [],
    files: [],
    notes: [],
  };
}

function readVault() {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return createEmptyVault();
    const parsed = JSON.parse(raw);
    return {
      folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
      files: Array.isArray(parsed?.files) ? parsed.files : [],
      notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
    };
  } catch {
    return createEmptyVault();
  }
}

function writeVault(vault) {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch {
    throw new Error('Browser storage limit reached. Delete older files or upload smaller ones.');
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes = 0) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export const vaultService = {
  getSnapshot() {
    const vault = readVault();
    const totalBytes = vault.files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    return {
      folders: [...vault.folders].sort((a, b) => a.name.localeCompare(b.name)),
      files: [...vault.files].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      notes: [...vault.notes].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return b.updated_at.localeCompare(a.updated_at);
      }),
      totalBytes,
    };
  },

  async list() {
    return this.getSnapshot();
  },

  async createFolder({ name, parentId = null }) {
    const clean = String(name || '').trim();
    if (!clean || clean.length > 60) {
      throw new Error('Folder name is required (max 60 characters).');
    }
    const vault = readVault();
    const exists = vault.folders.some(
      (f) => (f.parent_id || null) === (parentId || null) && f.name.toLowerCase() === clean.toLowerCase()
    );
    if (exists) {
      throw new Error(`Folder "${clean}" already exists in this location.`);
    }
    const now = new Date().toISOString();
    const folder = {
      id: createId(),
      name: clean,
      parent_id: parentId || null,
      created_at: now,
      updated_at: now,
    };
    vault.folders.push(folder);
    writeVault(vault);
    return folder;
  },

  async renameFolder(id, name) {
    const clean = String(name || '').trim();
    if (!clean || clean.length > 60) {
      throw new Error('Folder name is required (max 60 characters).');
    }
    const vault = readVault();
    const folder = vault.folders.find((f) => f.id === id);
    if (!folder) throw new Error('Folder not found.');
    const duplicate = vault.folders.some(
      (f) =>
        f.id !== id &&
        (f.parent_id || null) === (folder.parent_id || null) &&
        f.name.toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Folder "${clean}" already exists in this location.`);
    }
    folder.name = clean;
    folder.updated_at = new Date().toISOString();
    writeVault(vault);
    return folder;
  },

  async deleteFolder(id) {
    const vault = readVault();
    const toRemove = new Set([id]);
    let added = true;
    while (added) {
      added = false;
      for (const f of vault.folders) {
        if (f.parent_id && toRemove.has(f.parent_id) && !toRemove.has(f.id)) {
          toRemove.add(f.id);
          added = true;
        }
      }
    }
    vault.folders = vault.folders.filter((f) => !toRemove.has(f.id));
    vault.files = vault.files.filter((file) => !file.folder_id || !toRemove.has(file.folder_id));
    writeVault(vault);
    return { deletedFolderCount: toRemove.size };
  },

  async uploadFiles(fileList, targetFolderId = null) {
    const items = Array.from(fileList || []);
    if (items.length === 0) return { addedFiles: [], createdFolders: 0, skipped: [] };

    const vault = readVault();
    let currentBytes = vault.files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const addedFiles = [];
    const skipped = [];
    let createdFolders = 0;

    const ensureFolderPath = (segments, baseParentId) => {
      let parentId = baseParentId || null;
      for (const seg of segments) {
        const cleanSeg = String(seg || '').trim();
        if (!cleanSeg) continue;
        let existing = vault.folders.find(
          (f) => (f.parent_id || null) === parentId && f.name.toLowerCase() === cleanSeg.toLowerCase()
        );
        if (!existing) {
          const now = new Date().toISOString();
          existing = {
            id: createId(),
            name: cleanSeg.slice(0, 60),
            parent_id: parentId,
            created_at: now,
            updated_at: now,
          };
          vault.folders.push(existing);
          createdFolders += 1;
        }
        parentId = existing.id;
      }
      return parentId;
    };

    for (const file of items) {
      if (file.size > MAX_VAULT_FILE_BYTES) {
        skipped.push(`${file.name} (exceeds 2 MB limit)`);
        continue;
      }
      if (currentBytes + file.size > MAX_VAULT_TOTAL_BYTES) {
        skipped.push(`${file.name} (local storage budget full)`);
        continue;
      }

      const relPath = file.webkitRelativePath || '';
      let folderId = targetFolderId || null;
      if (relPath.includes('/')) {
        const parts = relPath.split('/').filter(Boolean);
        if (parts.length > 1) {
          folderId = ensureFolderPath(parts.slice(0, -1), targetFolderId);
        }
      }

      const dataUrl = await readFileAsDataUrl(file);
      const now = new Date().toISOString();
      const entry = {
        id: createId(),
        name: file.name,
        folder_id: folderId,
        mime_type: file.type || 'application/octet-stream',
        size: Number(file.size || 0),
        data_url: dataUrl,
        created_at: now,
      };
      vault.files.unshift(entry);
      addedFiles.push(entry);
      currentBytes += entry.size;
    }

    if (addedFiles.length > 0 || createdFolders > 0) {
      writeVault(vault);
    }
    return { addedFiles, createdFolders, skipped };
  },

  async moveFile(fileId, targetFolderId = null) {
    const vault = readVault();
    const file = vault.files.find((f) => f.id === fileId);
    if (!file) throw new Error('File not found.');
    file.folder_id = targetFolderId || null;
    writeVault(vault);
    return file;
  },

  async deleteFile(fileId) {
    const vault = readVault();
    vault.files = vault.files.filter((f) => f.id !== fileId);
    writeVault(vault);
    return { deletedId: fileId };
  },

  async createNote({ title = '', content = '', pinned = false }) {
    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || '').trim();
    if (!cleanTitle && !cleanContent) {
      throw new Error('Write a note title or body before saving.');
    }
    const vault = readVault();
    const now = new Date().toISOString();
    const note = {
      id: createId(),
      title: cleanTitle || 'Quick Note',
      content: cleanContent,
      pinned: Boolean(pinned),
      created_at: now,
      updated_at: now,
    };
    vault.notes.unshift(note);
    writeVault(vault);
    return note;
  },

  async updateNote(id, payload) {
    const vault = readVault();
    const note = vault.notes.find((n) => n.id === id);
    if (!note) throw new Error('Note not found.');
    if (payload.title !== undefined) {
      note.title = String(payload.title || '').trim() || 'Quick Note';
    }
    if (payload.content !== undefined) {
      note.content = String(payload.content || '').trim();
    }
    if (payload.pinned !== undefined) {
      note.pinned = Boolean(payload.pinned);
    }
    note.updated_at = new Date().toISOString();
    writeVault(vault);
    return note;
  },

  async deleteNote(id) {
    const vault = readVault();
    vault.notes = vault.notes.filter((n) => n.id !== id);
    writeVault(vault);
    return { deletedId: id };
  },

  resetVault() {
    try {
      localStorage.removeItem(VAULT_STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};
