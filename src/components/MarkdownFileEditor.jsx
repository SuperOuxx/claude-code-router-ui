import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save, Type, X, FileText } from 'lucide-react';
import { api } from '../utils/api';
import { loadVditor } from '../lib/vditorLoader';

// ============================================================================
// Constants
// ============================================================================

const TOOLBAR_CONFIG = [
  'headings',
  'bold',
  'italic',
  'strike',
  '|',
  'line',
  'quote',
  'list',
  'ordered-list',
  'check',
  '|',
  'code',
  'inline-code',
  'table',
  '|',
  'link',
  'upload',
  '|',
  'undo',
  'redo',
  '|',
  'edit-mode',
  'both',
  'preview',
  'fullscreen',
  'outline'
];

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

const VDITOR_MODE = {
  WYSIWYG: 'wysiwyg',
  IR: 'ir',
  SV: 'sv'
};

const EDITOR_MODE = {
  VDITOR: 'vditor',
  PLAIN: 'plain'
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 格式化资源为 Markdown 引用
 */
function formatAssetReference(file) {
  const rel = file.relativePath;
  const name = file.originalName || file.fileName || 'asset';
  const isImage = IMAGE_FILE_PATTERN.test(name);
  return isImage ? `![](${rel})` : `[${name}](${rel})`;
}

/**
 * 获取编辑器状态文本
 */
function getEditorStatusText(conflict, uploading, saving, dirty) {
  if (conflict) return 'Conflict';
  if (uploading) return 'Uploading…';
  if (saving) return 'Saving…';
  if (dirty) return 'Unsaved';
  return 'Saved';
}

/**
 * 获取主题模式
 */
function getThemeMode() {
  const savedTheme = localStorage.getItem('codeEditorTheme');
  return savedTheme === 'dark' || !savedTheme ? 'dark' : 'classic';
}

// ============================================================================
// Components
// ============================================================================

/**
 * 冲突解决弹窗
 */
function ConflictModal({ conflict, onReload, onOverwrite, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" data-testid="md-conflict-modal">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden border border-border">
        <div className="p-4 border-b border-border">
          <div className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4" />
            File changed on disk
          </div>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Another process modified this file since it was opened. Choose what to do:
          </div>
        </div>
        <div className="p-4 flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            onClick={onCancel}
            data-testid="md-conflict-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            onClick={onReload}
            data-testid="md-conflict-reload"
          >
            Reload
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm bg-red-600 hover:bg-red-700 text-white"
            onClick={onOverwrite}
            data-testid="md-conflict-overwrite"
          >
            Overwrite
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Markdown 文件编辑器组件
 */
function MarkdownFileEditor({ file, onClose, isActive = true, onDirtyChange = null }) {
  // ==========================================================================
  // State
  // ==========================================================================

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const [editorMode, setEditorMode] = useState(EDITOR_MODE.VDITOR);
  const [vditorInstance, setVditorInstance] = useState(null);
  const [vditorReady, setVditorReady] = useState(false);

  const [mtimeMs, setMtimeMs] = useState(null);
  const [conflict, setConflict] = useState(null);

  // ==========================================================================
  // Refs
  // ==========================================================================

  const vditorRef = useRef(null);

  // ==========================================================================
  // Memoized Values
  // ==========================================================================

  const isDarkMode = useMemo(() => getThemeMode() === 'dark', []);
  const statusText = useMemo(
    () => getEditorStatusText(conflict, uploading, saving, dirty),
    [conflict, uploading, saving, dirty]
  );

  // ==========================================================================
  // File Operations
  // ==========================================================================

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConflict(null);

    try {
      const response = await api.readFile(file.projectName, file.path);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to read file');
      }

      setContent(data.content || '');
      setMtimeMs(data.mtimeMs ?? null);
      setDirty(false);
    } catch (e) {
      console.error('Failed to load markdown file:', e);
      setError(e.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [file.projectName, file.path]);

  const saveNow = useCallback(async ({ force = false } = {}) => {
    if (!isActive) return;
    if (saving || uploading) return;
    if (!dirty && !force) return;

    setSaving(true);
    setError(null);

    // Get latest content from Vditor if available
    let contentToSave = content;
    if (editorMode === EDITOR_MODE.VDITOR && vditorInstance) {
      contentToSave = vditorInstance.getValue();
      setContent(contentToSave);
    }

    try {
      const response = await api.saveFile(file.projectName, file.path, contentToSave, {
        expectedMtimeMs: mtimeMs,
        force
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setConflict({
          serverContent: data.content || '',
          serverMtimeMs: data.mtimeMs ?? null
        });
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save file');
      }

      setMtimeMs(data.mtimeMs ?? mtimeMs);
      setDirty(false);
    } catch (e) {
      console.error('Failed to save markdown file:', e);
      setError(e.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [isActive, saving, uploading, dirty, file.projectName, file.path, content, mtimeMs, vditorInstance, editorMode]);

  const uploadAssets = useCallback(async (files) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const response = await api.uploadMarkdownAssets(file.projectName, file.path, list);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      const uploaded = Array.isArray(data.files) ? data.files : [];
      const refs = uploaded.map(formatAssetReference);

      if (refs.length > 0 && vditorInstance) {
        vditorInstance.insertValue(`\n${refs.join('\n')}\n`);
        setDirty(true);
      }
    } catch (e) {
      console.error('Failed to upload assets:', e);
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [file.projectName, file.path, vditorInstance]);

  // ==========================================================================
  // Vditor Integration
  // ==========================================================================

  useEffect(() => {
    if (editorMode !== EDITOR_MODE.VDITOR) return;
    if (!vditorRef.current) return;
    if (vditorInstance) return;

    const initVditor = async () => {
      try {
        const Vditor = await loadVditor();
        if (!vditorRef.current) return;

        const instance = new Vditor(vditorRef.current, {
          width: '100%',
          height: '100%',
          mode: VDITOR_MODE.WYSIWYG,
          theme: isDarkMode ? 'dark' : 'classic',
          icon: 'ant',
          value: content,
          placeholder: '开始编辑...',
          cache: { enable: false },
          toolbar: TOOLBAR_CONFIG,
          upload: {
            url: `/api/projects/${file.projectName}/upload-markdown-assets`,
            linkToImgUrl: `/api/projects/${file.projectName}/upload-markdown-assets`,
            max: MAX_UPLOAD_SIZE,
            fieldName: 'file[]',
            multiple: true,
            success: (editor, msg) => {
              try {
                const data = JSON.parse(msg);
                if (data.files?.length > 0) {
                  const ref = formatAssetReference(data.files[0]);
                  instance.insertValue(ref);
                }
              } catch (e) {
                console.error('Failed to parse upload response:', e);
              }
            },
            error: (msg) => {
              console.error('Upload error:', msg);
              setError(msg || 'Upload failed');
            }
          },
          after: () => setVditorReady(true),
          input: (value) => {
            setContent(value);
            setDirty(true);
          }
        });

        setVditorInstance(instance);
      } catch (e) {
        console.error('Failed to initialize Vditor:', e);
        setError('Failed to initialize Vditor editor');
        setEditorMode(EDITOR_MODE.PLAIN);
      }
    };

    initVditor();
  }, [editorMode, content, file.projectName, isDarkMode, vditorInstance]);

  // Update Vditor content when file is reloaded
  useEffect(() => {
    if (editorMode === EDITOR_MODE.VDITOR && vditorInstance && vditorReady && !dirty) {
      vditorInstance.setValue(content);
    }
  }, [content, editorMode, vditorInstance, vditorReady, dirty]);

  // Cleanup Vditor on unmount
  useEffect(() => {
    return () => {
      if (vditorInstance) {
        try {
          vditorInstance.destroy();
        } catch (e) {
          console.error('Failed to destroy Vditor:', e);
        }
      }
    };
  }, [vditorInstance]);

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Load file on mount
  useEffect(() => {
    loadFile();
  }, [loadFile]);

  // Notify parent of dirty state changes
  useEffect(() => {
    if (!onDirtyChange) return;
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;

    const onKeyDown = (e) => {
      const isSave = (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S');
      if (!isSave) return;
      e.preventDefault();
      saveNow();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, saveNow]);

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  const handleToggleEditorMode = () => {
    setEditorMode((prev) => (prev === EDITOR_MODE.VDITOR ? EDITOR_MODE.PLAIN : EDITOR_MODE.VDITOR));
    setVditorInstance(null);
    setVditorReady(false);
  };

  const handlePasteCapture = (e) => {
    if (!isActive) return;
    if (editorMode === EDITOR_MODE.VDITOR) return; // Vditor handles paste internally

    const files = Array.from(e.clipboardData?.files || []);
    if (files.length === 0) return;

    e.preventDefault();
    uploadAssets(files);
  };

  const handleDropCapture = (e) => {
    if (!isActive) return;
    if (editorMode === EDITOR_MODE.VDITOR) return; // Vditor handles drop internally

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    e.preventDefault();
    uploadAssets(files);
  };

  const handleConflictReload = () => {
    const newContent = conflict?.serverContent || '';
    setContent(newContent);
    setMtimeMs(conflict?.serverMtimeMs ?? null);
    setDirty(false);
    setConflict(null);

    if (editorMode === EDITOR_MODE.VDITOR && vditorInstance) {
      vditorInstance.setValue(newContent);
    }
  };

  const handleConflictOverwrite = async () => {
    setConflict(null);
    await saveNow({ force: true });
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="h-full w-full flex flex-col" data-testid="md-editor-modal">
      <div className="h-full w-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate" data-testid="md-editor-filename">
              {file.name}
            </h3>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span data-testid="md-editor-mode">
                {editorMode === EDITOR_MODE.VDITOR ? 'Vditor' : 'Plain text'}
              </span>
              <span className="select-none">•</span>
              <span data-testid="md-editor-status">{statusText}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              className="px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white flex items-center gap-2"
              onClick={handleToggleEditorMode}
              data-testid="md-editor-toggle-mode"
              title="Toggle editor mode"
            >
              <Type className="w-4 h-4" />
              {editorMode === EDITOR_MODE.VDITOR ? 'Plain text' : 'Use Vditor'}
            </button>

            <button
              type="button"
              className="px-3 py-2 rounded-md text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 disabled:opacity-50"
              onClick={() => saveNow()}
              disabled={saving || uploading || !isActive}
              data-testid="md-editor-save"
              title="Save (Ctrl/Cmd+S)"
            >
              <Save className="w-4 h-4" />
              Save
            </button>

            <button
              type="button"
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              onClick={onClose}
              data-testid="md-editor-close"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-4 py-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-200 border-b border-border">
            {error}
          </div>
        )}

        {/* Editor Area */}
        <div
          className="flex-1 overflow-hidden"
          data-testid="md-editor-dropzone"
          onPasteCapture={handlePasteCapture}
          onDragOver={(e) => e.preventDefault()}
          onDropCapture={handleDropCapture}
        >
          {loading && (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
              Loading…
            </div>
          )}

          {!loading && editorMode === EDITOR_MODE.VDITOR && (
            <div ref={vditorRef} className="h-full vditor-container" data-testid="vditor-editor" />
          )}

          {/* Expose raw content for Playwright assertions */}
          <textarea readOnly className="sr-only" value={content} data-testid="md-editor-raw" />
        </div>

        {/* Conflict Modal */}
        {conflict && (
          <ConflictModal
            conflict={conflict}
            onReload={handleConflictReload}
            onOverwrite={handleConflictOverwrite}
            onCancel={() => setConflict(null)}
          />
        )}
      </div>
    </div>
  );
}

export default MarkdownFileEditor;
