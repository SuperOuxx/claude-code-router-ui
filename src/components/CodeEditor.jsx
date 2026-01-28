import React, { useState, useEffect, useRef, useMemo, useImperativeHandle } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, showPanel, ViewPlugin } from '@codemirror/view';
import { unifiedMergeView, getChunks } from '@codemirror/merge';
import { showMinimap } from '@replit/codemirror-minimap';
import { X, Save, Download, Maximize2, Minimize2, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { useTranslation } from 'react-i18next';
import { loadVditor } from '../lib/vditorLoader';

const CodeEditor = React.forwardRef(function CodeEditor({ file, onClose, projectPath, isSidebar = false, isExpanded = false, onToggleExpand = null, isActive = true, onDirtyChange = null }, ref) {
  const { t } = useTranslation('codeEditor');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('codeEditorTheme');
    return savedTheme ? savedTheme === 'dark' : true;
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDiff, setShowDiff] = useState(!!file.diffInfo);
  const [wordWrap, setWordWrap] = useState(() => {
    return localStorage.getItem('codeEditorWordWrap') === 'true';
  });
  const [minimapEnabled, setMinimapEnabled] = useState(() => {
    return localStorage.getItem('codeEditorShowMinimap') !== 'false';
  });
  const [showLineNumbers, setShowLineNumbers] = useState(() => {
    return localStorage.getItem('codeEditorLineNumbers') !== 'false';
  });
  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('codeEditorFontSize') || '14';
  });
  const editorRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const [baselineMtimeMs, setBaselineMtimeMs] = useState(null);
  const [autoSaveBlocked, setAutoSaveBlocked] = useState(false);
  const [showAutoSaveNotice, setShowAutoSaveNotice] = useState(false);
  const [conflictDialog, setConflictDialog] = useState(null); // { resolve }
  const [savedContent, setSavedContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setShowDiff(!!file.diffInfo);
  }, [file.diffInfo]);

  const promptConflictResolution = () =>
    new Promise((resolve) => setConflictDialog({ resolve }));

  const resolveConflictDialog = (choice) => {
    conflictDialog?.resolve(choice);
    setConflictDialog(null);
  };

  const isMarkdownFile = useMemo(() => {
    const name = (file?.name || '').toLowerCase();
    return name.endsWith('.md') || name.endsWith('.markdown');
  }, [file?.name]);

  const [markdownEditorMode, setMarkdownEditorMode] = useState('plain'); // 'plain' | 'vditor'
  const [vditorError, setVditorError] = useState(null);
  const vditorIdRef = useRef(`vditor-${Math.random().toString(36).slice(2)}`);
  const vditorInstanceRef = useRef(null);
  const vditorApplyingExternalValueRef = useRef(false);
  const lastDirtyRef = useRef(false);

  // Create minimap extension with chunk-based gutters
  const minimapExtension = useMemo(() => {
    if (!file.diffInfo || !showDiff || !minimapEnabled) return [];

    const gutters = {};

    return [
      showMinimap.compute(['doc'], (state) => {
        // Get actual chunks from merge view
        const chunksData = getChunks(state);
        const chunks = chunksData?.chunks || [];

        // Clear previous gutters
        Object.keys(gutters).forEach(key => delete gutters[key]);

        // Mark lines that are part of chunks
        chunks.forEach(chunk => {
          // Mark the lines in the B side (current document)
          const fromLine = state.doc.lineAt(chunk.fromB).number;
          const toLine = state.doc.lineAt(Math.min(chunk.toB, state.doc.length)).number;

          for (let lineNum = fromLine; lineNum <= toLine; lineNum++) {
            gutters[lineNum] = isDarkMode ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 1)';
          }
        });

        return {
          create: () => ({ dom: document.createElement('div') }),
          displayText: 'blocks',
          showOverlay: 'always',
          gutters: [gutters]
        };
      })
    ];
  }, [file.diffInfo, showDiff, minimapEnabled, isDarkMode]);

  // Create extension to scroll to first chunk on mount
  const scrollToFirstChunkExtension = useMemo(() => {
    if (!file.diffInfo || !showDiff) return [];

    return [
      ViewPlugin.fromClass(class {
        constructor(view) {
          // Delay to ensure merge view is fully initialized
          setTimeout(() => {
            const chunksData = getChunks(view.state);
            const chunks = chunksData?.chunks || [];

            if (chunks.length > 0) {
              const firstChunk = chunks[0];

              // Scroll to the first chunk
              view.dispatch({
                effects: EditorView.scrollIntoView(firstChunk.fromB, { y: 'center' })
              });
            }
          }, 100);
        }

        update() {}
        destroy() {}
      })
    ];
  }, [file.diffInfo, showDiff]);

  // Create editor toolbar panel - always visible
  const editorToolbarPanel = useMemo(() => {
    const createPanel = (view) => {
      const dom = document.createElement('div');
      dom.className = 'cm-editor-toolbar-panel';

      let currentIndex = 0;

      const updatePanel = () => {
        // Check if we have diff info and it's enabled
        const hasDiff = file.diffInfo && showDiff;
        const chunksData = hasDiff ? getChunks(view.state) : null;
        const chunks = chunksData?.chunks || [];
        const chunkCount = chunks.length;

        // Build the toolbar HTML
        let toolbarHTML = '<div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">';

        // Left side - diff navigation (if applicable)
        toolbarHTML += '<div style="display: flex; align-items: center; gap: 8px;">';
        if (hasDiff) {
          toolbarHTML += `
            <span style="font-weight: 500;">${chunkCount > 0 ? `${currentIndex + 1}/${chunkCount}` : '0'} ${t('toolbar.changes')}</span>
            <button class="cm-diff-nav-btn cm-diff-nav-prev" title="${t('toolbar.previousChange')}" ${chunkCount === 0 ? 'disabled' : ''}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button class="cm-diff-nav-btn cm-diff-nav-next" title="${t('toolbar.nextChange')}" ${chunkCount === 0 ? 'disabled' : ''}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          `;
        }
        toolbarHTML += '</div>';

        // Right side - action buttons
        toolbarHTML += '<div style="display: flex; align-items: center; gap: 4px;">';

        // Show/hide diff button (only if there's diff info)
        if (file.diffInfo) {
          toolbarHTML += `
            <button class="cm-toolbar-btn cm-toggle-diff-btn" title="${showDiff ? t('toolbar.hideDiff') : t('toolbar.showDiff')}">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${showDiff ?
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />' :
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />'
                }
              </svg>
            </button>
          `;
        }

        // Settings button
        toolbarHTML += `
          <button class="cm-toolbar-btn cm-settings-btn" title="${t('toolbar.settings')}">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        `;

        // Expand button (only in sidebar mode)
        if (isSidebar && onToggleExpand) {
          toolbarHTML += `
            <button class="cm-toolbar-btn cm-expand-btn" title="${isExpanded ? t('toolbar.collapse') : t('toolbar.expand')}">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${isExpanded ?
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />' :
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />'
                }
              </svg>
            </button>
          `;
        }

        toolbarHTML += '</div>';
        toolbarHTML += '</div>';

        dom.innerHTML = toolbarHTML;

        // Attach event listeners for diff navigation
        if (hasDiff) {
          const prevBtn = dom.querySelector('.cm-diff-nav-prev');
          const nextBtn = dom.querySelector('.cm-diff-nav-next');

          prevBtn?.addEventListener('click', () => {
            if (chunks.length === 0) return;
            currentIndex = currentIndex > 0 ? currentIndex - 1 : chunks.length - 1;

            const chunk = chunks[currentIndex];
            if (chunk) {
              view.dispatch({
                effects: EditorView.scrollIntoView(chunk.fromB, { y: 'center' })
              });
            }
            updatePanel();
          });

          nextBtn?.addEventListener('click', () => {
            if (chunks.length === 0) return;
            currentIndex = currentIndex < chunks.length - 1 ? currentIndex + 1 : 0;

            const chunk = chunks[currentIndex];
            if (chunk) {
              view.dispatch({
                effects: EditorView.scrollIntoView(chunk.fromB, { y: 'center' })
              });
            }
            updatePanel();
          });
        }

        // Attach event listener for toggle diff button
        if (file.diffInfo) {
          const toggleDiffBtn = dom.querySelector('.cm-toggle-diff-btn');
          toggleDiffBtn?.addEventListener('click', () => {
            setShowDiff(!showDiff);
          });
        }

        // Attach event listener for settings button
        const settingsBtn = dom.querySelector('.cm-settings-btn');
        settingsBtn?.addEventListener('click', () => {
          if (window.openSettings) {
            window.openSettings('appearance');
          }
        });

        // Attach event listener for expand button
        if (isSidebar && onToggleExpand) {
          const expandBtn = dom.querySelector('.cm-expand-btn');
          expandBtn?.addEventListener('click', () => {
            onToggleExpand();
          });
        }
      };

      updatePanel();

      return {
        top: true,
        dom,
        update: updatePanel
      };
    };

    return [showPanel.of(createPanel)];
  }, [file.diffInfo, showDiff, isSidebar, isExpanded, onToggleExpand]);

  // Get language extension based on file extension
  const getLanguageExtension = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return [javascript({ jsx: true, typescript: ext.includes('ts') })];
      case 'py':
        return [python()];
      case 'html':
      case 'htm':
        return [html()];
      case 'css':
      case 'scss':
      case 'less':
        return [css()];
      case 'json':
        return [json()];
      case 'md':
      case 'markdown':
        return [markdown()];
      default:
        return [];
    }
  };

  // Load file content
  useEffect(() => {
    const loadFileContent = async () => {
      try {
        setLoading(true);
        setAutoSaveBlocked(false);
        setShowAutoSaveNotice(false);

        // If we have diffInfo with both old and new content, we can show the diff directly
        // This handles both GitPanel (full content) and ChatInterface (full content from API)
        if (file.diffInfo && file.diffInfo.new_string !== undefined && file.diffInfo.old_string !== undefined) {
          // Use the new_string as the content to display
          // The unifiedMergeView will compare it against old_string
          setContent(file.diffInfo.new_string);
          setSavedContent(file.diffInfo.new_string);
          const statResponse = await api.readFile(file.projectName, file.path);
          if (statResponse.ok) {
            const statData = await statResponse.json();
            setBaselineMtimeMs(statData.mtimeMs ?? null);
          } else {
            setBaselineMtimeMs(null);
          }
          setLoading(false);
          return;
        }

        // Otherwise, load from disk
        const response = await api.readFile(file.projectName, file.path);

        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        setContent(data.content);
        setSavedContent(data.content);
        setBaselineMtimeMs(data.mtimeMs ?? null);
      } catch (error) {
        console.error('Error loading file:', error);
        const errorText = `// Error loading file: ${error.message}\n// File: ${file.name}\n// Path: ${file.path}`;
        setContent(errorText);
        setSavedContent(errorText);
        setBaselineMtimeMs(null);
      } finally {
        setLoading(false);
      }
    };

    loadFileContent();
  }, [file, projectPath]);

  useEffect(() => {
    if (isMarkdownFile) {
      setMarkdownEditorMode('vditor');
    } else {
      setMarkdownEditorMode('plain');
    }
    setVditorError(null);
  }, [isMarkdownFile, file.path]);

  useEffect(() => {
    const dirty = content !== savedContent;
    setIsDirty(dirty);
    if (onDirtyChange && lastDirtyRef.current !== dirty) {
      lastDirtyRef.current = dirty;
      onDirtyChange(dirty);
    }
  }, [content, savedContent, onDirtyChange]);

  const destroyVditor = () => {
    try {
      vditorInstanceRef.current?.destroy?.();
    } catch (e) {
      // ignore
    }
    vditorInstanceRef.current = null;
  };

  useEffect(() => {
    if (!isMarkdownFile) return;
    if (markdownEditorMode !== 'vditor') {
      destroyVditor();
      return;
    }
    if (!isActive) {
      destroyVditor();
      return;
    }

    let cancelled = false;
    const init = async () => {
      try {
        const Vditor = await loadVditor();
        if (cancelled) return;
        if (vditorInstanceRef.current) return;

        vditorInstanceRef.current = new Vditor(vditorIdRef.current, {
          mode: 'ir',
          height: '100%',
          cache: { enable: false },
          toolbarConfig: { pin: false },
          input: (value) => {
            if (vditorApplyingExternalValueRef.current) return;
            setContent(value);
          },
          after: () => {
            if (!vditorInstanceRef.current) return;
            vditorApplyingExternalValueRef.current = true;
            vditorInstanceRef.current.setValue(content || '');
            vditorApplyingExternalValueRef.current = false;
          }
        });
      } catch (err) {
        const message = err?.message || String(err);
        console.error('Failed to load Vditor:', err);
        setVditorError(message);
        setMarkdownEditorMode('plain');
      }
    };

    init();
    return () => { cancelled = true; };
  }, [isMarkdownFile, markdownEditorMode, isActive, file.path]);

  useEffect(() => {
    if (!isMarkdownFile) return;
    if (markdownEditorMode !== 'vditor') return;
    if (!isActive) return;
    const instance = vditorInstanceRef.current;
    if (!instance?.getValue || !instance?.setValue) return;

    const currentValue = instance.getValue();
    if (currentValue === content) return;

    vditorApplyingExternalValueRef.current = true;
    instance.setValue(content || '');
    vditorApplyingExternalValueRef.current = false;
  }, [content, isMarkdownFile, markdownEditorMode, isActive]);

  const reloadFromDisk = async () => {
    try {
      setLoading(true);
      const response = await api.readFile(file.projectName, file.path);
      if (!response.ok) {
        throw new Error(`Failed to reload file: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setContent(data.content);
      setSavedContent(data.content);
      setBaselineMtimeMs(data.mtimeMs ?? null);
      setAutoSaveBlocked(false);
      setShowAutoSaveNotice(false);
      return true;
    } catch (error) {
      console.error('Error reloading file:', error);
      alert(`Error reloading file: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const saveToDisk = async ({ force = false, showSuccessFeedback = true } = {}) => {
    const response = await api.saveFile(file.projectName, file.path, content, {
      expectedMtimeMs: baselineMtimeMs,
      force,
    });

    if (response.status === 409) {
      const errorData = await response.json().catch(() => ({}));
      return { conflict: true, ...errorData };
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Save failed: ${response.status}`);
      }
      const textError = await response.text();
      console.error('Non-JSON error response:', textError);
      throw new Error(`Save failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    setBaselineMtimeMs(result.mtimeMs ?? baselineMtimeMs);
    setSavedContent(content);
    setAutoSaveBlocked(false);
    setShowAutoSaveNotice(false);

    if (showSuccessFeedback) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }

    return { success: true };
  };

  const saveWithConflictHandling = async (trigger) => {
    if (!isDirty) return true;
    if (saving) return false;

    setSaving(true);
    let saveResult;
    try {
      saveResult = await saveToDisk({ force: false, showSuccessFeedback: trigger === 'manual' });
    } catch (error) {
      console.error('Error saving file:', error);
      alert(`Error saving file: ${error.message}`);
      setSaving(false);
      return false;
    }
    setSaving(false);

    if (!saveResult?.conflict) return true;

    // Autosave: non-blocking notice only; stop this autosave
    if (trigger === 'auto') {
      setAutoSaveBlocked(true);
      setShowAutoSaveNotice(true);
      return false;
    }

    const choice = await promptConflictResolution();

    if (choice === 'reload') {
      await reloadFromDisk();
      return true;
    }

    if (choice === 'overwrite') {
      setSaving(true);
      try {
        await saveToDisk({ force: true, showSuccessFeedback: trigger === 'manual' });
        return true;
      } catch (error) {
        console.error('Error overwriting file:', error);
        alert(`Error overwriting file: ${error.message}`);
        return false;
      } finally {
        setSaving(false);
      }
    }

    // cancel: do not write, keep dirty/content
    return false;
  };

  const handleSave = async () => {
    await saveWithConflictHandling('manual');
  };

  const handleRequestClose = async () => {
    if (!isDirty) return onClose();
    const ok = await saveWithConflictHandling('close');
    if (ok) onClose();
  };

  useImperativeHandle(ref, () => ({
    prepareForSwitch: async () => {
      if (!isDirty) return true;
      return await saveWithConflictHandling('switch');
    },
    hasUnsavedChanges: () => isDirty,
  }));

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Save theme preference to localStorage
  useEffect(() => {
    localStorage.setItem('codeEditorTheme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Save word wrap preference to localStorage
  useEffect(() => {
    localStorage.setItem('codeEditorWordWrap', wordWrap.toString());
  }, [wordWrap]);

  // Listen for settings changes from the Settings modal
  useEffect(() => {
    const handleStorageChange = () => {
      const newTheme = localStorage.getItem('codeEditorTheme');
      if (newTheme) {
        setIsDarkMode(newTheme === 'dark');
      }

      const newWordWrap = localStorage.getItem('codeEditorWordWrap');
      if (newWordWrap !== null) {
        setWordWrap(newWordWrap === 'true');
      }

      const newShowMinimap = localStorage.getItem('codeEditorShowMinimap');
      if (newShowMinimap !== null) {
        setMinimapEnabled(newShowMinimap !== 'false');
      }

      const newShowLineNumbers = localStorage.getItem('codeEditorLineNumbers');
      if (newShowLineNumbers !== null) {
        setShowLineNumbers(newShowLineNumbers !== 'false');
      }

      const newFontSize = localStorage.getItem('codeEditorFontSize');
      if (newFontSize) {
        setFontSize(newFontSize);
      }
    };

    // Listen for storage events (changes from other tabs/windows)
    window.addEventListener('storage', handleStorageChange);

    // Custom event for same-window updates
    window.addEventListener('codeEditorSettingsChanged', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('codeEditorSettingsChanged', handleStorageChange);
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleRequestClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [content, isActive, isDirty, saving]);

  // Debounced autosave (no modal on conflict)
  useEffect(() => {
    if (!isActive) return;
    if (!isDirty) return;
    if (saving) return;
    if (autoSaveBlocked) return;
    if (file.diffInfo) return; // avoid autosaving diff-based suggested content
    if (baselineMtimeMs === null) return;

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveWithConflictHandling('auto');
    }, 1200);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [content, isDirty, saving, autoSaveBlocked, file.diffInfo, baselineMtimeMs, isActive]);

  if (loading) {
    return (
      <>
        <style>
          {`
            .code-editor-loading {
              background-color: ${isDarkMode ? '#111827' : '#ffffff'} !important;
            }
            .code-editor-loading:hover {
              background-color: ${isDarkMode ? '#111827' : '#ffffff'} !important;
            }
          `}
        </style>
        {isSidebar ? (
          <div className="w-full h-full flex items-center justify-center bg-background">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-gray-900 dark:text-white">{t('loading', { fileName: file.name })}</span>
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-40 md:bg-black/50 md:flex md:items-center md:justify-center">
            <div className="code-editor-loading w-full h-full md:rounded-lg md:w-auto md:h-auto p-8 flex items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="text-gray-900 dark:text-white">{t('loading', { fileName: file.name })}</span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <style>
        {`
          /* Light background for full line changes */
          .cm-deletedChunk {
            background-color: ${isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 235, 235, 1)'} !important;
            border-left: 3px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.6)' : 'rgb(239, 68, 68)'} !important;
            padding-left: 4px !important;
          }

          .cm-insertedChunk {
            background-color: ${isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(230, 255, 237, 1)'} !important;
            border-left: 3px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.6)' : 'rgb(34, 197, 94)'} !important;
            padding-left: 4px !important;
          }

          /* Override linear-gradient underline and use solid darker background for partial changes */
          .cm-editor.cm-merge-b .cm-changedText {
            background: ${isDarkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)'} !important;
            padding-top: 2px !important;
            padding-bottom: 2px !important;
            margin-top: -2px !important;
            margin-bottom: -2px !important;
          }

          .cm-editor .cm-deletedChunk .cm-changedText {
            background: ${isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)'} !important;
            padding-top: 2px !important;
            padding-bottom: 2px !important;
            margin-top: -2px !important;
            margin-bottom: -2px !important;
          }

          /* Minimap gutter styling */
          .cm-gutter.cm-gutter-minimap {
            background-color: ${isDarkMode ? '#1e1e1e' : '#f5f5f5'};
          }

          /* Editor toolbar panel styling */
          .cm-editor-toolbar-panel {
            padding: 8px 12px;
            background-color: ${isDarkMode ? '#1f2937' : '#ffffff'};
            border-bottom: 1px solid ${isDarkMode ? '#374151' : '#e5e7eb'};
            color: ${isDarkMode ? '#d1d5db' : '#374151'};
            font-size: 14px;
          }

          .cm-diff-nav-btn,
          .cm-toolbar-btn {
            padding: 4px;
            background: transparent;
            border: none;
            cursor: pointer;
            border-radius: 4px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: inherit;
            transition: background-color 0.2s;
          }

          .cm-diff-nav-btn:hover,
          .cm-toolbar-btn:hover {
            background-color: ${isDarkMode ? '#374151' : '#f3f4f6'};
          }

          .cm-diff-nav-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}
      </style>
      <div className={isSidebar ?
        'w-full h-full flex flex-col' :
        `fixed inset-0 z-40 ${
          // Mobile: native fullscreen, Desktop: modal with backdrop
          'md:bg-black/50 md:flex md:items-center md:justify-center md:p-4'
        } ${isFullscreen ? 'md:p-0' : ''}`}>
        <div className={isSidebar ?
          'bg-background flex flex-col w-full h-full' :
          `bg-background shadow-2xl flex flex-col ${
          // Mobile: always fullscreen, Desktop: modal sizing
          'w-full h-full md:rounded-lg md:shadow-2xl' +
          (isFullscreen ? ' md:w-full md:h-full md:rounded-none' : ' md:w-full md:max-w-6xl md:h-[80vh] md:max-h-[80vh]')
        }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-white truncate">{file.name}{isDirty ? ' *' : ''}</h3>
                {file.diffInfo && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-2 py-1 rounded whitespace-nowrap">
                    {t('header.showingChanges')}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{file.path}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {isMarkdownFile && (
              <button
                type="button"
                onClick={() => {
                  if (markdownEditorMode === 'vditor') {
                    destroyVditor();
                    setMarkdownEditorMode('plain');
                  } else {
                    setVditorError(null);
                    setMarkdownEditorMode('vditor');
                  }
                }}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                title={markdownEditorMode === 'vditor' ? t('markdown.switchToPlainText') : t('markdown.openWithVditor')}
              >
                {markdownEditorMode === 'vditor' ? t('markdown.plainText') : 'Vditor'}
              </button>
            )}
            <button
              onClick={handleDownload}
              className="p-2 md:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
              title={t('actions.download')}
            >
              <Download className="w-5 h-5 md:w-4 md:h-4" />
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-3 py-2 text-white rounded-md disabled:opacity-50 flex items-center gap-2 transition-colors min-h-[44px] md:min-h-0 ${
                saveSuccess
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {saveSuccess ? (
                <>
                  <svg className="w-5 h-5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="hidden sm:inline">{t('actions.saved')}</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">{saving ? t('actions.saving') : t('actions.save')}</span>
                </>
              )}
            </button>

            {!isSidebar && (
              <button
                onClick={toggleFullscreen}
                className="hidden md:flex p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 items-center justify-center"
                title={isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}

            <button
              onClick={handleRequestClose}
              className="p-2 md:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
              title={t('actions.close')}
            >
              <X className="w-6 h-6 md:w-4 md:h-4" />
            </button>
          </div>
        </div>

        {vditorError && (
          <div className="px-4 py-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-b border-border">
            {t('markdown.vditorLoadFailed', { error: vditorError })}
          </div>
        )}

        {autoSaveBlocked && showAutoSaveNotice && (
          <div className="px-4 py-2 border-b border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-900/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-700 dark:text-yellow-300" />
            <div className="flex-1 text-sm text-yellow-900 dark:text-yellow-100">
              <div className="font-medium">{t('conflict.autosaveSkippedTitle')}</div>
              <div>{t('conflict.autosaveSkippedBody')}</div>
            </div>
            <button
              onClick={() => setShowAutoSaveNotice(false)}
              className="p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
              title={t('actions.close')}
            >
              <X className="w-4 h-4 text-yellow-900 dark:text-yellow-100" />
            </button>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {isMarkdownFile && markdownEditorMode === 'vditor' ? (
            <div id={vditorIdRef.current} className="h-full w-full" />
          ) : (
            <CodeMirror
              ref={editorRef}
              value={content}
              onChange={setContent}
              extensions={[
                ...getLanguageExtension(file.name),
                // Always show the toolbar
                ...editorToolbarPanel,
                // Only show diff-related extensions when diff is enabled
                ...(file.diffInfo && showDiff && file.diffInfo.old_string !== undefined
                  ? [
                      unifiedMergeView({
                        original: file.diffInfo.old_string,
                        mergeControls: false,
                        highlightChanges: true,
                        syntaxHighlightDeletions: false,
                        gutter: true
                        // NOTE: NO collapseUnchanged - this shows the full file!
                      }),
                      ...minimapExtension,
                      ...scrollToFirstChunkExtension
                    ]
                  : []),
                ...(wordWrap ? [EditorView.lineWrapping] : [])
              ]}
              theme={isDarkMode ? oneDark : undefined}
              height="100%"
              style={{
                fontSize: `${fontSize}px`,
                height: '100%',
              }}
              basicSetup={{
                lineNumbers: showLineNumbers,
                foldGutter: true,
                dropCursor: false,
                allowMultipleSelections: false,
                indentOnInput: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                highlightSelectionMatches: true,
                searchKeymap: true,
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t border-border bg-muted flex-shrink-0">
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>{t('footer.lines')} {content.split('\n').length}</span>
            <span>{t('footer.characters')} {content.length}</span>
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            {t('footer.shortcuts')}
          </div>
        </div>
      </div>
    </div>

    {conflictDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => resolveConflictDialog('cancel')} />
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
          <div className="p-6">
            <div className="flex items-center mb-4">
              <div className="p-2 rounded-full mr-3 bg-yellow-100 dark:bg-yellow-900">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h3 className="text-lg font-semibold">{t('conflict.title')}</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {t('conflict.message')}
            </p>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-6 space-y-2">
              <div>• {t('conflict.reloadWarning')}</div>
              <div>• {t('conflict.overwriteWarning')}</div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => resolveConflictDialog('cancel')}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                {t('conflict.cancel')}
              </button>
              <button
                onClick={() => resolveConflictDialog('reload')}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              >
                {t('conflict.reload')}
              </button>
              <button
                onClick={() => resolveConflictDialog('overwrite')}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md"
              >
                {t('conflict.overwrite')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
});

export default CodeEditor;
