import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save, Type, X, FileText } from 'lucide-react';
import { api } from '../utils/api';
import { loadVditor } from '../lib/vditorLoader';
import { useTheme } from '../contexts/ThemeContext';

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

// getThemeMode function removed - now using useTheme() hook

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

  const { isDarkMode } = useTheme(); // Use app theme instead of separate editor theme
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

  // Destroy and recreate Vditor when file changes
  useEffect(() => {
    if (editorMode !== EDITOR_MODE.VDITOR) return;

    // Destroy existing instance when file path changes
    if (vditorInstance) {
      try {
        vditorInstance.destroy();
      } catch (e) {
        console.error('Failed to destroy Vditor:', e);
      }
      setVditorInstance(null);
      setVditorReady(false);
    }
  }, [file.path, editorMode]); // Destroy when file path or editor mode changes

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
  }, [editorMode, content, file.projectName, file.path, vditorInstance, isDarkMode]);

  // Update Vditor theme when isDarkMode changes
  useEffect(() => {
    if (editorMode !== EDITOR_MODE.VDITOR || !vditorInstance) return;

    try {
      vditorInstance.setTheme(isDarkMode ? 'dark' : 'classic');
    } catch (e) {
      console.error('Failed to update Vditor theme:', e);
    }
  }, [isDarkMode, editorMode, vditorInstance]);

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
    <div className="w-full h-full flex flex-col" data-testid="md-editor-modal">
      <style>
        {`
          /* Vditor dark mode theme fixes */
          .vditor-container.vditor--dark {
            --toolbar-background-color: #1f2937;
            --panel-background-color: #1f2937;
            --textarea-background-color: #1f2937;
            --border-color: #374151;
            --text-color: #e5e7eb;
            --heading-color: #f3f4f6;
            --quote-color: #d1d5db;
            --code-background-color: #111827;
            --code-color: #e5e7eb;
            --preview-background-color: #1f2937;
          }

          /* Toolbar styling */
          .vditor-container.vditor--dark .vditor-toolbar,
          .vditor-container.vditor--dark .vditor-toolbar--pin {
            background-color: var(--toolbar-background-color);
            border-bottom-color: var(--border-color);
          }

          .vditor-container.vditor--dark .vditor-toolbar button {
            color: #d1d5db;
          }

          .vditor-container.vditor--dark .vditor-toolbar button:hover {
            background-color: #374151;
            color: #f3f4f6;
          }

          /* Content area - base text color */
          .vditor-container.vditor--dark .vditor-content,
          .vditor-container.vditor--dark .vditor-ir,
          .vditor-container.vditor--dark .vditor-wysiwyg,
          .vditor-container.vditor--dark .vditor-sv {
            background-color: var(--textarea-background-color);
            color: var(--text-color) !important;
          }

          /* All text elements in editor */
          .vditor-container.vditor--dark .vditor-ir p,
          .vditor-container.vditor--dark .vditor-wysiwyg p,
          .vditor-container.vditor--dark .vditor-sv p,
          .vditor-container.vditor--dark .vditor-ir span,
          .vditor-container.vditor--dark .vditor-wysiwyg span,
          .vditor-container.vditor--dark .vditor-sv span,
          .vditor-container.vditor--dark .vditor-ir div,
          .vditor-container.vditor--dark .vditor-wysiwyg div,
          .vditor-container.vditor--dark .vditor-sv div {
            color: var(--text-color) !important;
          }

          /* Headings */
          .vditor-container.vditor--dark .vditor-ir h1,
          .vditor-container.vditor--dark .vditor-ir h2,
          .vditor-container.vditor--dark .vditor-ir h3,
          .vditor-container.vditor--dark .vditor-ir h4,
          .vditor-container.vditor--dark .vditor-ir h5,
          .vditor-container.vditor--dark .vditor-ir h6,
          .vditor-container.vditor--dark .vditor-wysiwyg h1,
          .vditor-container.vditor--dark .vditor-wysiwyg h2,
          .vditor-container.vditor--dark .vditor-wysiwyg h3,
          .vditor-container.vditor--dark .vditor-wysiwyg h4,
          .vditor-container.vditor--dark .vditor-wysiwyg h5,
          .vditor-container.vditor--dark .vditor-wysiwyg h6,
          .vditor-container.vditor--dark .vditor-sv h1,
          .vditor-container.vditor--dark .vditor-sv h2,
          .vditor-container.vditor--dark .vditor-sv h3,
          .vditor-container.vditor--dark .vditor-sv h4,
          .vditor-container.vditor--dark .vditor-sv h5,
          .vditor-container.vditor--dark .vditor-sv h6 {
            color: var(--heading-color) !important;
          }

          /* Links */
          .vditor-container.vditor--dark .vditor-ir a,
          .vditor-container.vditor--dark .vditor-wysiwyg a,
          .vditor-container.vditor--dark .vditor-sv a {
            color: #60a5fa !important;
          }

          .vditor-container.vditor--dark .vditor-ir a:hover,
          .vditor-container.vditor--dark .vditor-wysiwyg a:hover,
          .vditor-container.vditor--dark .vditor-sv a:hover {
            color: #93c5fd !important;
          }

          /* Blockquotes */
          .vditor-container.vditor--dark .vditor-ir blockquote,
          .vditor-container.vditor--dark .vditor-wysiwyg blockquote,
          .vditor-container.vditor--dark .vditor-sv blockquote {
            color: var(--quote-color) !important;
            border-left-color: var(--border-color) !important;
            background-color: rgba(55, 65, 81, 0.3);
          }

          /* Lists */
          .vditor-container.vditor--dark .vditor-ir ul,
          .vditor-container.vditor--dark .vditor-wysiwyg ul,
          .vditor-container.vditor--dark .vditor-sv ul,
          .vditor-container.vditor--dark .vditor-ir ol,
          .vditor-container.vditor--dark .vditor-wysiwyg ol,
          .vditor-container.vditor--dark .vditor-sv ol,
          .vditor-container.vditor--dark .vditor-ir li,
          .vditor-container.vditor--dark .vditor-wysiwyg li,
          .vditor-container.vditor--dark .vditor-sv li {
            color: var(--text-color) !important;
          }

          /* Code blocks */
          .vditor-container.vditor--dark .vditor-ir pre,
          .vditor-container.vditor--dark .vditor-wysiwyg pre,
          .vditor-container.vditor--dark .vditor-sv pre,
          .vditor-container.vditor--dark .vditor-ir code,
          .vditor-container.vditor--dark .vditor-wysiwyg code,
          .vditor-container.vditor--dark .vditor-sv code {
            background-color: var(--code-background-color) !important;
            color: var(--code-color) !important;
          }

          .vditor-container.vditor--dark .vditor-ir pre.vditor-ir__marker--pre,
          .vditor-container.vditor--dark .vditor-ir code.vditor-ir__marker--pre {
            background-color: var(--code-background-color);
            color: var(--code-color);
          }

          /* Inline code */
          .vditor-container.vditor--dark .vditor-ir p code,
          .vditor-container.vditor--dark .vditor-wysiwyg p code,
          .vditor-container.vditor--dark .vditor-sv p code {
            background-color: rgba(17, 24, 39, 0.5) !important;
            color: #e5e7eb !important;
            border: 1px solid #374151;
          }

          /* Tables */
          .vditor-container.vditor--dark .vditor-ir table,
          .vditor-container.vditor--dark .vditor-wysiwyg table,
          .vditor-container.vditor--dark .vditor-sv table {
            color: var(--text-color) !important;
            border-color: var(--border-color) !important;
          }

          .vditor-container.vditor--dark .vditor-ir th,
          .vditor-container.vditor--dark .vditor-wysiwyg th,
          .vditor-container.vditor--dark .vditor-sv th {
            background-color: #374151 !important;
            color: #f3f4f6 !important;
            border-color: var(--border-color) !important;
          }

          .vditor-container.vditor--dark .vditor-ir td,
          .vditor-container.vditor--dark .vditor-wysiwyg td,
          .vditor-container.vditor--dark .vditor-sv td {
            background-color: #1f2937 !important;
            color: #e5e7eb !important;
            border-color: var(--border-color) !important;
          }

          /* Text formatting */
          .vditor-container.vditor--dark .vditor-ir strong,
          .vditor-container.vditor--dark .vditor-wysiwyg strong,
          .vditor-container.vditor--dark .vditor-sv strong,
          .vditor-container.vditor--dark .vditor-ir b,
          .vditor-container.vditor--dark .vditor-wysiwyg b,
          .vditor-container.vditor--dark .vditor-sv b {
            color: #f3f4f6 !important;
            font-weight: 700;
          }

          .vditor-container.vditor--dark .vditor-ir em,
          .vditor-container.vditor--dark .vditor-wysiwyg em,
          .vditor-container.vditor--dark .vditor-sv em,
          .vditor-container.vditor--dark .vditor-ir i,
          .vditor-container.vditor--dark .vditor-wysiwyg i,
          .vditor-container.vditor--dark .vditor-sv i {
            color: #e5e7eb !important;
          }

          /* HR */
          .vditor-container.vditor--dark .vditor-ir hr,
          .vditor-container.vditor--dark .vditor-wysiwyg hr,
          .vditor-container.vditor--dark .vditor-sv hr {
            border-color: var(--border-color) !important;
          }

          /* Images */
          .vditor-container.vditor--dark .vditor-ir img,
          .vditor-container.vditor--dark .vditor-wysiwyg img,
          .vditor-container.vditor--dark .vditor-sv img {
            background-color: transparent;
          }

          /* Task lists */
          .vditor-container.vditor--dark .vditor-ir input[type="checkbox"],
          .vditor-container.vditor--dark .vditor-wysiwyg input[type="checkbox"],
          .vditor-container.vditor--dark .vditor-sv input[type="checkbox"] {
            background-color: #374151;
            border-color: #4b5563;
          }

          /* Expand/collapse markers */
          .vditor-container.vditor--dark .vditor-ir .vditor-ir__node--expand:before,
          .vditor-container.vditor--dark .vdior-ir .vditor-ir__node--expand:before {
            border-left-color: var(--border-color);
            border-right-color: var(--border-color);
          }

          /* Placeholder text */
          .vditor-container.vditor--dark .vditor-ir::placeholder,
          .vditor-container.vditor--dark .vditor-wysiwyg::placeholder {
            color: #6b7280;
          }

          /* Selection */
          .vditor-container.vditor--dark ::selection {
            background-color: rgba(96, 165, 250, 0.3);
            color: #f3f4f6;
          }

          /* Light mode theme */
          .vditor-container.vditor--classic {
            --toolbar-background-color: #ffffff;
            --panel-background-color: #ffffff;
            --textarea-background-color: #ffffff;
            --border-color: #e5e7eb;
            --text-color: #1f2937;
            --heading-color: #111827;
            --quote-color: #4b5563;
            --code-background-color: #f3f4f6;
            --code-color: #1f2937;
          }
        `}
      </style>
      <div className="bg-background w-full h-full flex flex-col overflow-hidden">

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
