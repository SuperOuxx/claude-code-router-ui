/*
 * MainContent.jsx - Main Content Area with Session Protection Props Passthrough
 * 
 * SESSION PROTECTION PASSTHROUGH:
 * ===============================
 * 
 * This component serves as a passthrough layer for Session Protection functions:
 * - Receives session management functions from App.jsx
 * - Passes them down to ChatInterface.jsx
 * 
 * No session protection logic is implemented here - it's purely a props bridge.
 */

import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus } from 'lucide-react';
import ChatInterface from './ChatInterface';
import CodeEditor from './CodeEditor';
import MarkdownFileEditor from './MarkdownFileEditor';
import StandaloneShell from './StandaloneShell';
import GitPanel from './GitPanel';
import ErrorBoundary from './ErrorBoundary';
import ClaudeLogo from './ClaudeLogo';
import CursorLogo from './CursorLogo';
import CodexLogo from './CodexLogo';
import TaskList from './TaskList';
import TaskDetail from './TaskDetail';
import PRDEditor from './PRDEditor';
import Tooltip from './Tooltip';
import { useTaskMaster } from '../contexts/TaskMasterContext';
import { useTasksSettings } from '../contexts/TasksSettingsContext';
import { api } from '../utils/api';
import { cn } from '../lib/utils';

const CHAT_PANEL_DEFAULT_WIDTH = 500;
const CHAT_PANEL_MIN_WIDTH = 250;

const MainContent = React.memo(React.forwardRef(function MainContent({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  messages,
  isMobile,
  isPWA,
  onMenuClick,
  isLoading,
  onInputFocusChange,
  // Session Protection Props: Functions passed down from App.jsx to manage active session state
  // These functions control when project updates are paused during active conversations
  onSessionActive,        // Mark session as active when user sends message
  onSessionInactive,      // Mark session as inactive when conversation completes/aborts
  onSessionProcessing,    // Mark session as processing (thinking/working)
  onSessionNotProcessing, // Mark session as not processing (finished thinking)
  processingSessions,     // Set of session IDs currently processing
  onReplaceTemporarySession, // Replace temporary session ID with real session ID from WebSocket
  onNavigateToSession,    // Navigate to a specific session (for Claude CLI session duplication workaround)
  onShowSettings,         // Show tools settings panel
  autoExpandTools,        // Auto-expand tool accordions
  showRawParameters,      // Show raw parameters in tool accordions
  showThinking,           // Show thinking/reasoning sections
  autoScrollToBottom,     // Auto-scroll to bottom when new messages arrive
  sendByCtrlEnter,        // Send by Ctrl+Enter mode for East Asian language input
  externalMessageUpdate,  // Trigger for external CLI updates to current session
  projects,               // All projects data
  onNewSession            // Create new session handler
}, ref) {
  const { t } = useTranslation();
  const [editingFile, setEditingFile] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [editorWidth, setEditorWidth] = useState(null); // null means fill available space
  const [chatWidth, setChatWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isChatResizing, setIsChatResizing] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(true); // Start expanded by default
  const resizeRef = useRef(null);
  const chatResizeRef = useRef(null);
  const chatResizeMetrics = useRef(null);
  const codeEditorRef = useRef(null);

  // Session dropdown state
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  // PRD Editor state
  const [showPRDEditor, setShowPRDEditor] = useState(false);
  const [selectedPRD, setSelectedPRD] = useState(null);
  const [existingPRDs, setExistingPRDs] = useState([]);
  const [prdNotification, setPRDNotification] = useState(null);
  
  // TaskMaster context
  const { tasks, currentProject, refreshTasks, setCurrentProject } = useTaskMaster();
  const { tasksEnabled, isTaskMasterInstalled, isTaskMasterReady } = useTasksSettings();
  
  // Only show tasks tab if TaskMaster is installed and enabled
  const shouldShowTasksTab = tasksEnabled && isTaskMasterInstalled;

  // Sync selectedProject with TaskMaster context
  useEffect(() => {
    if (selectedProject && selectedProject !== currentProject) {
      setCurrentProject(selectedProject);
    }
  }, [selectedProject, currentProject, setCurrentProject]);

  // Switch away from tasks tab when tasks are disabled or TaskMaster is not installed
  useEffect(() => {
    if (!shouldShowTasksTab && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [shouldShowTasksTab, activeTab, setActiveTab]);

  // Load existing PRDs when current project changes
  useEffect(() => {
    const loadExistingPRDs = async () => {
      if (!currentProject?.name) {
        setExistingPRDs([]);
        return;
      }

      try {
        const response = await api.get(`/taskmaster/prd/${encodeURIComponent(currentProject.name)}`);
        if (response.ok) {
          const data = await response.json();
          setExistingPRDs(data.prdFiles || []);
        } else {
          setExistingPRDs([]);
        }
      } catch (error) {
        console.error('Failed to load existing PRDs:', error);
        setExistingPRDs([]);
      }
    };

    loadExistingPRDs();
  }, [currentProject?.name]);

  // Helper function to get all sessions for selected project
  const getAllSessions = () => {
    if (!selectedProject || !projects) return [];

    const project = projects.find(p => p.name === selectedProject.name);
    if (!project) return [];

    // Combine Claude, Cursor, and Codex sessions
    const claudeSessions = (project.sessions || []).map(s => ({ ...s, __provider: 'claude' }));
    const cursorSessions = (project.cursorSessions || []).map(s => ({ ...s, __provider: 'cursor' }));
    const codexSessions = (project.codexSessions || []).map(s => ({ ...s, __provider: 'codex' }));

    // Sort by most recent activity/date
    const normalizeDate = (s) => {
      if (s.__provider === 'cursor') return new Date(s.createdAt);
      if (s.__provider === 'codex') return new Date(s.createdAt || s.lastActivity);
      return new Date(s.lastActivity);
    };

    return [...claudeSessions, ...cursorSessions, ...codexSessions].sort((a, b) => normalizeDate(b) - normalizeDate(a));
  };

  // Helper function to check if a file is a markdown file
  const isMarkdownFile = useCallback((fileName) => {
    if (!fileName) return false;
    const name = fileName.toLowerCase();
    return name.endsWith('.md') || name.endsWith('.markdown');
  }, []);

  const handleFileOpen = async (filePath, diffInfo = null, projectNameOverride = null) => {
    // Create a file object that CodeEditor expects
    const nextFile = {
      name: filePath.split(/[\\/]/).pop(),
      path: filePath,
      projectName: projectNameOverride || selectedProject?.name,
      diffInfo: diffInfo // Pass along diff information if available
    };

    if (editingFile?.projectName === nextFile.projectName && editingFile?.path === nextFile.path) {
      return;
    }

    if (editingFile && codeEditorRef.current?.prepareForSwitch) {
      const ok = await codeEditorRef.current.prepareForSwitch();
      if (!ok) return;
    }

    setEditingFile(nextFile);
  };

  const handleCloseEditor = () => {
    setEditingFile(null);
    setEditorExpanded(false);
  };

  const showChatPanel = activeTab === 'chat' && (!isMobile || !editingFile);
  const editorProjectPath = useMemo(() => {
    const editorProject = projects?.find(p => p.name === editingFile?.projectName) || selectedProject;
    return editorProject?.path;
  }, [projects, selectedProject, editingFile?.projectName]);

  useImperativeHandle(ref, () => ({
    openFile: handleFileOpen,
    closeFile: handleCloseEditor
  }));

  const handleToggleEditorExpand = () => {
    const newExpanded = !editorExpanded;
    setEditorExpanded(newExpanded);

    // When collapsing, set a reasonable default width
    if (!newExpanded && editorWidth === null) {
      setEditorWidth(600);
    }
  };

  const handleTaskClick = (task) => {
    // If task is just an ID (from dependency click), find the full task object
    if (typeof task === 'object' && task.id && !task.title) {
      const fullTask = tasks?.find(t => t.id === task.id);
      if (fullTask) {
        setSelectedTask(fullTask);
        setShowTaskDetail(true);
      }
    } else {
      setSelectedTask(task);
      setShowTaskDetail(true);
    }
  };

  const handleTaskDetailClose = () => {
    setShowTaskDetail(false);
    setSelectedTask(null);
  };

  const handleTaskStatusChange = (taskId, newStatus) => {
    // This would integrate with TaskMaster API to update task status
    console.log('Update task status:', taskId, newStatus);
    refreshTasks?.();
  };

  // Handle resize functionality
  const handleMouseDown = (e) => {
    if (isMobile) return; // Disable resize on mobile
    setIsResizing(true);
    e.preventDefault();
  };

  const handleChatResizeMouseDown = useCallback((event) => {
    if (isMobile) return;

    event.preventDefault();

    const container = chatResizeRef.current?.parentElement;
    if (!container) return;

    const { right, width } = container.getBoundingClientRect();

    chatResizeMetrics.current = {
      containerRight: right,
      containerWidth: width
    };

    setIsChatResizing(true);
  }, [isMobile]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const container = resizeRef.current?.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;

      // Min width: 300px, Max width: 80% of container
      const minWidth = 300;
      const maxWidth = containerRect.width * 0.8;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setEditorWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  useEffect(() => {
    if (!isChatResizing) return;

    const handleMouseMove = (event) => {
      if (!chatResizeMetrics.current) return;

      const { containerRight, containerWidth } = chatResizeMetrics.current;
      const nextWidth = containerRight - event.clientX;
      const clampedWidth = Math.max(
        CHAT_PANEL_MIN_WIDTH,
        Math.min(containerWidth, nextWidth)
      );

      setChatWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsChatResizing(false);
      chatResizeMetrics.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isChatResizing]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {/* Header with menu button for mobile */}
        {isMobile && (
          <div
            className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0"
          >
            <button
              onClick={onMenuClick}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 pwa-menu-button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <div className="w-12 h-12 mx-auto mb-4">
              <div 
                className="w-full h-full rounded-full border-4 border-gray-200 border-t-blue-500" 
                style={{ 
                  animation: 'spin 1s linear infinite',
                  WebkitAnimation: 'spin 1s linear infinite',
                  MozAnimation: 'spin 1s linear infinite'
                }} 
              />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('mainContent.loading')}</h2>
            <p>{t('mainContent.settingUpWorkspace')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div className="h-full flex flex-col">
        {/* Header with menu button for mobile */}
        {isMobile && (
          <div
            className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0"
          >
            <button
              onClick={onMenuClick}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 pwa-menu-button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400 max-w-md mx-auto px-6">
            <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">{t('mainContent.chooseProject')}</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              {t('mainContent.selectProjectDescription')}
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                💡 <strong>{t('mainContent.tip')}:</strong> {isMobile ? t('mainContent.createProjectMobile') : t('mainContent.createProjectDesktop')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs */}
      <div
        className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0"
      >
        <div className="flex items-center justify-between relative gap-3">
          {/* Left Side: Menu Button + Session Selector + Title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isMobile && (
              <button
                onClick={onMenuClick}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onMenuClick();
                }}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 touch-manipulation active:scale-95 pwa-menu-button flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            {/* Session Selector - Only show when project is selected and on chat tab */}
            {selectedProject && activeTab === 'chat' && (
              <div className="flex-shrink-0 hidden sm:block">
                <div className="relative">
                  <button
                    onClick={() => setShowSessionDropdown(!showSessionDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-background border border-border rounded-md hover:bg-accent transition-colors min-w-[280px]"
                  >
                    {selectedSession ? (
                      <>
                        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-primary/10">
                          {selectedSession.__provider === 'cursor' ? (
                            <CursorLogo className="w-2.5 h-2.5" />
                          ) : selectedSession.__provider === 'codex' ? (
                            <CodexLogo className="w-2.5 h-2.5" />
                          ) : (
                            <ClaudeLogo className="w-2.5 h-2.5" />
                          )}
                        </div>
                        <span className="truncate flex-1 text-left">
                          {selectedSession.__provider === 'cursor'
                            ? (selectedSession.name || 'Untitled Session')
                            : (selectedSession.summary || 'New Session')}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Select a session...</span>
                    )}
                    <ChevronDown className={cn(
                      "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform",
                      showSessionDropdown && "transform rotate-180"
                    )} />
                  </button>

                  {/* Dropdown Menu */}
                  {showSessionDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowSessionDropdown(false)}
                      />
                      <div className="absolute z-20 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-64 overflow-y-auto left-0">
                        {getAllSessions().length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No sessions yet
                          </div>
                        ) : (
                          <>
                            {getAllSessions().map((session) => {
                              const isCursorSession = session.__provider === 'cursor';
                              const isCodexSession = session.__provider === 'codex';
                              const sessionName = isCursorSession
                                ? (session.name || 'Untitled Session')
                                : isCodexSession
                                  ? (session.summary || session.name || 'Codex Session')
                                  : (session.summary || 'New Session');

                              return (
                                <button
                                  key={session.id}
                                  onClick={() => {
                                    onNavigateToSession(session.id);
                                    setShowSessionDropdown(false);
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-accent transition-colors",
                                    selectedSession?.id === session.id && "bg-accent"
                                  )}
                                >
                                  <div className={cn(
                                    "w-4 h-4 rounded flex items-center justify-center flex-shrink-0",
                                    selectedSession?.id === session.id ? "bg-primary/20" : "bg-muted/50"
                                  )}>
                                    {isCursorSession ? (
                                      <CursorLogo className="w-2.5 h-2.5" />
                                    ) : isCodexSession ? (
                                      <CodexLogo className="w-2.5 h-2.5" />
                                    ) : (
                                      <ClaudeLogo className="w-2.5 h-2.5" />
                                    )}
                                  </div>
                                  <span className="truncate flex-1">{sessionName}</span>
                                </button>
                              );
                            })}
                            {/* New Session Option */}
                            <div className="border-t border-border">
                              <button
                                onClick={() => {
                                  onNewSession(selectedProject);
                                  setShowSessionDropdown(false);
                                }}
                                className="w-full flex items-center gap-2 p-2 text-sm text-primary hover:bg-accent transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>New Session</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Title */}
            
          </div>

          {/* Modern Tab Navigation - Right Side */}
          <div className="flex-shrink-0 hidden sm:block">
            <div className="relative flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <Tooltip content={t('tabs.chat')} position="bottom">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${
                    activeTab === 'chat'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-1 sm:gap-1.5">
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="hidden md:hidden lg:inline">{t('tabs.chat')}</span>
                  </span>
                </button>
              </Tooltip>
              <Tooltip content={t('tabs.shell')} position="bottom">
                <button
                  onClick={() => setActiveTab('shell')}
                  className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                    activeTab === 'shell'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-1 sm:gap-1.5">
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden md:hidden lg:inline">{t('tabs.shell')}</span>
                  </span>
                </button>
              </Tooltip>
              <Tooltip content={t('tabs.git')} position="bottom">
                <button
                  onClick={() => setActiveTab('git')}
                  className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                    activeTab === 'git'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-1 sm:gap-1.5">
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="hidden md:hidden lg:inline">{t('tabs.git')}</span>
                  </span>
                </button>
              </Tooltip>
              {shouldShowTasksTab && (
                <Tooltip content={t('tabs.tasks')} position="bottom">
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                      activeTab === 'tasks'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-1 sm:gap-1.5">
                      <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span className="hidden md:hidden lg:inline">{t('tabs.tasks')}</span>
                    </span>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Three-Column Layout: Editor | Chat */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Middle Column: Editor */}
        <div
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
          style={showChatPanel ? { maxWidth: `calc(100% - ${chatWidth}px)` } : undefined}
        >
          {editingFile ? (
              <>
                {/* Resize handle - only show when editor is not expanded */}
                {!editorExpanded && (
                  <div
                    ref={resizeRef}
                    onMouseDown={handleMouseDown}
                    className="flex-shrink-0 w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize transition-colors relative group"
                    title="Drag to resize"
                  >
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-blue-500 dark:bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
                {/* Editor container - fills available space when expanded */}
                <div
                  className={`h-full overflow-hidden ${editorExpanded ? 'flex-1' : ''}`}
                  style={editorExpanded ? {} : { width: `${editorWidth}px` }}
                >
                  {/* Use MarkdownFileEditor for markdown files, CodeEditor for other files */}
                  {isMarkdownFile(editingFile.name) ? (
                    <MarkdownFileEditor
                      file={editingFile}
                      onClose={handleCloseEditor}
                      isActive={true}
                    />
                  ) : (
                    <CodeEditor
                      ref={codeEditorRef}
                      file={editingFile}
                      onClose={handleCloseEditor}
                      projectPath={editorProjectPath}
                      isSidebar={true}
                      isExpanded={editorExpanded}
                      onToggleExpand={handleToggleEditorExpand}
                    />
                  )}
                </div>
              </>
            ) : activeTab === 'shell' ? (
              <div className="h-full w-full overflow-hidden">
                <StandaloneShell
                  project={selectedProject}
                  session={selectedSession}
                  showHeader={false}
                />
              </div>
            ) : activeTab === 'git' ? (
              <div className="h-full overflow-hidden">
                <GitPanel selectedProject={selectedProject} isMobile={isMobile} onFileOpen={handleFileOpen} />
              </div>
            ) : shouldShowTasksTab && activeTab === 'tasks' ? (
              <div className="h-full flex flex-col overflow-hidden">
                <TaskList
                  tasks={tasks || []}
                  onTaskClick={handleTaskClick}
                  showParentTasks={true}
                  className="flex-1 overflow-y-auto p-4"
                  currentProject={currentProject}
                  onTaskCreated={refreshTasks}
                  onShowPRDEditor={(prd = null) => {
                    setSelectedPRD(prd);
                    setShowPRDEditor(true);
                  }}
                  existingPRDs={existingPRDs}
                  onRefreshPRDs={(showNotification = false) => {
                    if (currentProject?.name) {
                      api.get(`/taskmaster/prd/${encodeURIComponent(currentProject.name)}`)
                        .then(response => response.ok ? response.json() : Promise.reject())
                        .then(data => {
                          setExistingPRDs(data.prdFiles || []);
                          if (showNotification) {
                            setPRDNotification('PRD saved successfully!');
                            setTimeout(() => setPRDNotification(null), 3000);
                          }
                        })
                        .catch(error => console.error('Failed to refresh PRDs:', error));
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium">No file selected</p>
                  <p className="text-sm mt-2">Select a file from the tree to view its contents</p>
                </div>
              </div>
            )}
        </div>

        {/* Right Column: Chat Interface - Fixed right edge, resizable width */}
        <div
          ref={chatResizeRef}
          className={`min-w-[250px] border-l border-gray-200 dark:border-gray-700 ${showChatPanel ? 'flex' : 'hidden'}`}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${chatWidth}px`
          }}
        >
          <div className="h-full overflow-hidden flex flex-col relative">
            {/* Resize Handle - Left edge of chat panel */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 bg-transparent hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize transition-colors group z-10"
              onMouseDown={handleChatResizeMouseDown}
            >
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-transparent group-hover:bg-blue-500 dark:group-hover:bg-blue-600 transition-colors rounded-full" />
            </div>
            <ErrorBoundary showDetails={true}>
              <ChatInterface
                selectedProject={selectedProject}
                selectedSession={selectedSession}
                ws={ws}
                sendMessage={sendMessage}
                messages={messages}
                onFileOpen={handleFileOpen}
                onInputFocusChange={onInputFocusChange}
                onSessionActive={onSessionActive}
                onSessionInactive={onSessionInactive}
                onSessionProcessing={onSessionProcessing}
                onSessionNotProcessing={onSessionNotProcessing}
                processingSessions={processingSessions}
                onReplaceTemporarySession={onReplaceTemporarySession}
                onNavigateToSession={onNavigateToSession}
                onShowSettings={onShowSettings}
                autoExpandTools={autoExpandTools}
                showRawParameters={showRawParameters}
                showThinking={showThinking}
                autoScrollToBottom={autoScrollToBottom}
                sendByCtrlEnter={sendByCtrlEnter}
                externalMessageUpdate={externalMessageUpdate}
                onShowAllTasks={tasksEnabled ? () => setActiveTab('tasks') : null}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Task Detail Modal */}
      {shouldShowTasksTab && showTaskDetail && selectedTask && (
        <TaskDetail
          task={selectedTask}
          isOpen={showTaskDetail}
          onClose={handleTaskDetailClose}
          onStatusChange={handleTaskStatusChange}
          onTaskClick={handleTaskClick}
        />
      )}
      {/* PRD Editor Modal */}
      {showPRDEditor && (
        <PRDEditor
          project={currentProject}
          projectPath={currentProject?.fullPath || currentProject?.path}
          onClose={() => {
            setShowPRDEditor(false);
            setSelectedPRD(null);
          }}
          isNewFile={!selectedPRD?.isExisting}
          file={{ 
            name: selectedPRD?.name || 'prd.txt',
            content: selectedPRD?.content || ''
          }}
          onSave={async () => {
            setShowPRDEditor(false);
            setSelectedPRD(null);
            
            // Reload existing PRDs with notification
            try {
              const response = await api.get(`/taskmaster/prd/${encodeURIComponent(currentProject.name)}`);
              if (response.ok) {
                const data = await response.json();
                setExistingPRDs(data.prdFiles || []);
                setPRDNotification('PRD saved successfully!');
                setTimeout(() => setPRDNotification(null), 3000);
              }
            } catch (error) {
              console.error('Failed to refresh PRDs:', error);
            }
            
            refreshTasks?.();
          }}
        />
      )}
      {/* PRD Notification */}
      {prdNotification && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 duration-300">
          <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{prdNotification}</span>
          </div>
        </div>
      )}
    </div>
  );
}));

export default MainContent;
