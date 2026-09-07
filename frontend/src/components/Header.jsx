import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  Folder,
  FileSpreadsheet,
  Download,
  User,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  HardDrive,
  History,
  Settings as SettingsIcon,
  FlaskConical,
  Boxes,
  CheckCircle2,
  AlertCircle,
  Info,
  Trash2,
  Check,
  X,
  HelpCircle,
  Timer
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function Header() {
  const navigate = useNavigate();
  const {
    generatedReport,
    logout,
    projectsList,
    activeProject,
    selectProject,
    setSelectedTest,
    setRunTarget,
    notifications,
    markAllNotificationsRead,
    clearNotifications,
    unreadNotificationsCount,
    showToast,
    isExecuting,
    formattedElapsedTime,
    setShowShortcutsModal
  } = useProject();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const notificationsRef = useRef(null);
  const dropdownRef = useRef(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setShowNotifications(false);
        setShowProfileMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute search results
  const q = searchQuery.toLowerCase().trim();
  
  const matchedProjects = q
    ? (projectsList || []).filter((p) =>
        (p.project_name || '').toLowerCase().includes(q) ||
        (p.framework_type || '').toLowerCase().includes(q)
      )
    : [];

  const matchedTests = (q && activeProject?.test_files)
    ? activeProject.test_files.filter((t) => t.toLowerCase().includes(q))
    : [];

  const navPages = [
    { title: 'Test Execution Workbench', path: '/dashboard', icon: LayoutDashboard, category: 'Pages' },
    { title: 'Workspace File Manager', path: '/workspace', icon: HardDrive, category: 'Pages' },
    { title: 'Execution Logs & History', path: '/logs', icon: History, category: 'Pages' },
    { title: 'Platform Settings & Diagnostics', path: '/settings', icon: SettingsIcon, category: 'Pages' },
  ];

  const matchedPages = q
    ? navPages.filter((p) => p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
    : [];

  const hasResults = matchedProjects.length > 0 || matchedTests.length > 0 || matchedPages.length > 0;

  const handleSelectProjectResult = async (proj) => {
    await selectProject(proj);
    showToast(`Loaded ${proj.project_name}`, 'success');
    navigate('/dashboard');
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleSelectTestResult = (testFile) => {
    setSelectedTest(testFile);
    setRunTarget('selected');
    showToast(`Selected test: ${testFile.split('/').pop()}`, 'info');
    navigate('/dashboard');
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleSelectPageResult = (path) => {
    navigate(path);
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  return (
    <header className="h-[64px] bg-white border-b border-custom-border px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Search Input & Live Dropdown */}
      <div className="relative w-72 sm:w-96" ref={searchContainerRef}>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            id="global-search-input"
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            placeholder="Search projects, tests, or tools... (Ctrl+K)"
            className="w-full bg-slate-50 border border-custom-border rounded-custom pl-9 pr-12 py-1.5 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition font-sans"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="p-0.5 rounded text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded">
                Ctrl K
              </kbd>
            )}
          </div>
        </div>

        {/* Global Search Results Dropdown */}
        {isSearchOpen && searchQuery.trim() && (
          <div className="absolute left-0 top-10 w-full sm:w-[420px] bg-white border border-custom-border rounded-xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 max-h-[380px] overflow-y-auto space-y-3">
            {!hasResults ? (
              <div className="p-4 text-center text-xs text-slate-500 space-y-1">
                <Search className="h-5 w-5 text-slate-300 mx-auto mb-1" />
                <p className="font-semibold text-slate-700">No results found for "{searchQuery}"</p>
                <p className="text-[11px]">Try searching by project name, test method, or navigation page.</p>
              </div>
            ) : (
              <>
                {/* Matched Projects */}
                {matchedProjects.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                      Applications ({matchedProjects.length})
                    </span>
                    <div className="space-y-0.5">
                      {matchedProjects.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectProjectResult(p)}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs transition cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <Boxes className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="font-bold text-slate-800 truncate">{p.project_name}</span>
                          </div>
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                            {p.framework_type || 'Project'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matched Tests in Current Project */}
                {matchedTests.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                      Test Suites ({matchedTests.length})
                    </span>
                    <div className="space-y-0.5">
                      {matchedTests.slice(0, 8).map((t, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectTestResult(t)}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs transition cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <FlaskConical className="h-4 w-4 text-indigo-600 shrink-0" />
                            <span className="font-mono text-slate-700 truncate">{t.split('/').pop()}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">Run test</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matched Pages */}
                {matchedPages.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                      Navigation Pages
                    </span>
                    <div className="space-y-0.5">
                      {matchedPages.map((page, idx) => {
                        const Icon = page.icon;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectPageResult(page.path)}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon className="h-4 w-4 text-slate-600 shrink-0" />
                              <span className="font-semibold text-slate-800">{page.title}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{page.path}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right Action Icons & Profile */}
      <div className="flex items-center gap-3">
        {/* Live Execution Stopwatch Ticker */}
        {isExecuting && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-custom bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono font-bold shadow-xs animate-in fade-in">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <Timer className="h-3.5 w-3.5 text-emerald-600" />
            <span>{formattedElapsedTime}</span>
          </div>
        )}

        {/* Download Excel Report Button */}
        {generatedReport && (
          <a
            id="btn-download-excel-report"
            href={generatedReport.download_url}
            download={generatedReport.file_name}
            className="px-3.5 py-1.5 rounded-custom bg-success hover:bg-emerald-600 text-white font-bold text-xs shadow-xs flex items-center gap-2 transition animate-bounce border border-emerald-600 cursor-pointer"
            title={`Download ${generatedReport.file_name}`}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-white" />
            <span className="truncate max-w-xs">Download Excel Report</span>
            <Download className="h-3.5 w-3.5" />
          </a>
        )}

        {/* Workspace status badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-custom bg-slate-50 border border-custom-border text-xs font-medium text-text-secondary">
          <Folder className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-text-primary">workspace/</span>
          <span className="w-2 h-2 rounded-full bg-success"></span>
        </div>

        {/* Shortcuts Cheat Sheet Button */}
        <button
          id="btn-shortcuts-modal"
          onClick={() => setShowShortcutsModal(true)}
          className="p-1.5 px-2 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary hover:text-text-primary transition text-xs font-mono font-bold flex items-center gap-1 cursor-pointer"
          title="Keyboard Shortcuts Cheat Sheet (?)"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="text-[10px] hidden md:inline">?</span>
        </button>

        {/* Interactive Notification Bell */}
        <div className="relative" ref={notificationsRef}>
          <button
            id="btn-notifications"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) {
                markAllNotificationsRead();
              }
            }}
            className="p-1.5 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary hover:text-text-primary transition relative cursor-pointer"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand rounded-full animate-pulse"></span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div className="absolute right-0 top-11 w-80 sm:w-96 bg-white border border-custom-border rounded-xl shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-900">Notifications</h3>
                </div>
                {notifications.length > 0 && (
                  <button
                    onClick={clearNotifications}
                    className="text-[11px] text-slate-400 hover:text-red-600 transition flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  <CheckCircle2 className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
                  <p>All caught up! No active notifications.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-100 hover:bg-slate-100/60 transition space-y-0.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{n.title}</span>
                        <span className="text-[10px] text-slate-400">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile Avatar & Interactive Dropdown Menu */}
        <div className="relative border-l border-custom-border pl-3" ref={dropdownRef}>
          <button
            id="btn-profile-dropdown"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1 rounded-custom hover:bg-slate-50 border border-transparent hover:border-custom-border transition cursor-pointer"
          >
            <img
              src="/testbench-logo.png"
              alt="TestBench Logo"
              className="h-8 w-8 rounded-full object-contain border border-brand/20 p-0.5 bg-slate-50 shadow-xs shrink-0"
            />
            <div className="text-left hidden md:block">
              <p className="text-xs font-bold text-text-primary leading-tight">CallHealth Admin</p>
              <p className="text-[10px] text-text-secondary font-mono leading-tight">callhealth@12</p>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 hidden md:block ${showProfileMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Profile Dropdown Menu Card */}
          {showProfileMenu && (
            <div className="absolute right-0 top-12 w-56 bg-white border border-custom-border rounded-custom shadow-md p-2 z-50 animate-fadeIn space-y-1">
              <div className="p-2.5 bg-slate-50 rounded-custom border border-custom-border mb-1">
                <p className="text-xs font-bold text-text-primary">CallHealth Admin</p>
                <p className="text-[11px] text-text-secondary font-mono">callhealth@12</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                  Active Session
                </span>
              </div>

              <button
                id="btn-profile-logout"
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-custom transition cursor-pointer text-left"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
