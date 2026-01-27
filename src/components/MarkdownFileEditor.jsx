import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Edit3, Eye, Save, Type, X, FileText } from 'lucide-react';
import { api } from '../utils/api';

const AUTOSAVE_DEBOUNCE_MS = 800;

function MarkdownFileEditor({ file, onClose, isActive = true, onDirtyChange = null }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const [editorMode, setEditorMode] = useState('vditor'); // 'vditor' | 'plain'
  const [panelMode, setPanelMode] = useState('edit'); // 'edit' | 'preview' (only meaningful for vditor)

  const [mtimeMs, setMtimeMs] = useState(null);
  const [conflict, setConflict] = useState(null); // { serverContent, serverMtimeMs }

  const editorRef = useRef(null);
  const autosaveTimerRef = useRef(null);

  const isDarkMode = useMemo(() => {
    const savedTheme = localStorage.getItem('codeEditorTheme');
    return savedTheme ? savedTheme === 'dark' : true;
  }, []);

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
      setPanelMode('edit');
    } catch (e) {
      console.error('Failed to load markdown file:', e);
      setError(e.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [file.projectName, file.path]);

  useEffect(() => {
    loadFile();
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [loadFile]);

  useEffect(() => {
    if (!onDirtyChange) return;
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const saveNow = useCallback(async ({ force = false } = {}) => {
    if (!isActive) return;
    if (saving || uploading) return;
    if (!dirty && !force) return;

    setSaving(true);
    setError(null);

    try {
      const response = await api.saveFile(file.projectName, file.path, content, {
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
  }, [isActive, saving, uploading, dirty, file.projectName, file.path, content, mtimeMs]);

  useEffect(() => {
    if (!isActive) return;
    if (!dirty) return;
    if (saving || uploading) return;
    if (conflict) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isActive, content, dirty, saving, uploading, conflict, saveNow]);

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

  const insertAtCursor = useCallback((text) => {
    const view = editorRef.current?.view;
    if (!view) {
      setContent((prev) => prev + text);
      setDirty(true);
      return;
    }

    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length }
    });
    view.focus();
  }, []);

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
      const refs = uploaded.map((f) => {
        const rel = f.relativePath;
        const name = f.originalName || f.fileName || 'asset';
        const isImage = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(name);
        return isImage ? `![](${rel})` : `[${name}](${rel})`;
      });

      if (refs.length > 0) {
        insertAtCursor(`\n${refs.join('\n')}\n`);
      }
    } catch (e) {
      console.error('Failed to upload assets:', e);
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [file.projectName, file.path, insertAtCursor]);

  const statusText = conflict
    ? 'Conflict'
    : uploading
      ? 'Uploading…'
      : saving
        ? 'Saving…'
        : dirty
          ? 'Unsaved'
          : 'Saved';

  const showEditor = !loading && (editorMode === 'plain' || panelMode === 'edit');
  const showPreview = !loading && editorMode === 'vditor' && panelMode === 'preview';

  const handlePasteCapture = (e) => {
    if (!isActive) return;
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length === 0) return;

    e.preventDefault();
    uploadAssets(files);
  };

  const handleDropCapture = (e) => {
    if (!isActive) return;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    e.preventDefault();
    uploadAssets(files);
  };

  const handleConflictReload = () => {
    setContent(conflict?.serverContent || '');
    setMtimeMs(conflict?.serverMtimeMs ?? null);
    setDirty(false);
    setConflict(null);
  };

  const handleConflictOverwrite = async () => {
    setConflict(null);
    await saveNow({ force: true });
  };

  return (
    <div className="h-full w-full flex flex-col" data-testid="md-editor-modal">
      <div className="h-full w-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate" data-testid="md-editor-filename">
              {file.name}
            </h3>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span data-testid="md-editor-mode">{editorMode === 'vditor' ? 'Vditor' : 'Plain text'}</span>
              <span className="select-none">•</span>
              <span data-testid="md-editor-status">{statusText}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {editorMode === 'vditor' && (
              <button
                type="button"
                className="px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white flex items-center gap-2"
                onClick={() => setPanelMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
                data-testid="md-editor-toggle-preview"
                title="Toggle edit/preview"
              >
                {panelMode === 'edit' ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                {panelMode === 'edit' ? 'Preview' : 'Edit'}
              </button>
            )}

            <button
              type="button"
              className="px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white flex items-center gap-2"
              onClick={() => {
                setEditorMode((m) => (m === 'vditor' ? 'plain' : 'vditor'));
                setPanelMode('edit');
              }}
              data-testid="md-editor-toggle-mode"
              title="Toggle editor mode"
            >
              <Type className="w-4 h-4" />
              {editorMode === 'vditor' ? 'Plain text' : 'Use Vditor'}
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

        {error && (
          <div className="px-4 py-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-200 border-b border-border">
            {error}
          </div>
        )}

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

          {showPreview && (
            <div className="h-full overflow-auto p-6 prose dark:prose-invert max-w-none" data-testid="md-editor-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )}

          {showEditor && (
            <div className="h-full" data-testid="md-editor-edit">
              <CodeMirror
                ref={editorRef}
                value={content}
                onChange={(v) => {
                  setContent(v);
                  setDirty(true);
                }}
                extensions={[
                  ...(editorMode === 'vditor' ? [markdown()] : []),
                  EditorView.lineWrapping
                ]}
                theme={isDarkMode ? oneDark : undefined}
                height="100%"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: true,
                  allowMultipleSelections: false,
                  indentOnInput: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  highlightSelectionMatches: true,
                  searchKeymap: true,
                }}
              />
            </div>
          )}

          {/* Expose raw content for Playwright assertions */}
          <textarea readOnly className="sr-only" value={content} data-testid="md-editor-raw" />
        </div>

        {conflict && (
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
                  onClick={() => { setConflict(null); }}
                  data-testid="md-conflict-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                  onClick={handleConflictReload}
                  data-testid="md-conflict-reload"
                >
                  Reload
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-md text-sm bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleConflictOverwrite}
                  data-testid="md-conflict-overwrite"
                >
                  Overwrite
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MarkdownFileEditor;
