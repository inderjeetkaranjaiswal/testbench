import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Layers,
  Plus,
  FolderGit2,
  FlaskConical,
  FileCode2,
  ChevronRight,
  LayoutDashboard,
  FolderKanban,
  Terminal,
  Settings,
  RefreshCw,
  Box,
  Play,
  Cpu,
  GripVertical,
  ChevronDown,
  CheckSquare,
  Square,
  Search,
  Copy,
  Check,
  X
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function Sidebar() {
  const navigate = useNavigate();
  const {
    activeProject,
    selectedTest,
    setSelectedTest,
    selectedTests,
    setSelectedTests,
    toggleTestSelection,
    selectAllTests,
    deselectAllTests,
    setRunTarget,
    projectsList,
    loadingProjects,
    loadingTests,
    fetchProjects,
    selectProject,
    showToast,
  } = useProject();

  const [testFilter, setTestFilter] = useState('');
  const [copiedTarget, setCopiedTarget] = useState('');

  // Sidebar resizing state (min: 200px, max: 550px, default: 290px)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('testbench_sidebar_width');
    return saved ? parseInt(saved, 10) : 310;
  });
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(e.clientX, 200), 550);
      setSidebarWidth(newWidth);
      localStorage.setItem('testbench_sidebar_width', newWidth.toString());
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const getFrameworkBadge = (framework, language) => {
    const fw = framework?.toLowerCase();
    const lang = language?.toLowerCase();

    let fwBadge = null;
    if (fw === 'appium') {
      fwBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">Appium</span>;
    } else if (fw === 'selenium') {
      fwBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">Selenium</span>;
    } else if (fw === 'playwright') {
      fwBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-200 uppercase">Playwright</span>;
    } else {
      fwBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">{framework || 'Generic'}</span>;
    }

    let langBadge = null;
    if (lang === 'java') {
      langBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Java</span>;
    } else if (lang === 'python') {
      langBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Python</span>;
    } else if (lang === 'typescript') {
      langBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200">TS</span>;
    } else if (lang === 'javascript') {
      langBadge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-50 text-yellow-800 border border-yellow-200">JS</span>;
    }

    return (
      <div className="flex items-center gap-1">
        {fwBadge}
        {langBadge}
      </div>
    );
  };

  // Get active tests: prefer individual discovered tests, fallback to test files
  const activeTestItems = activeProject?.tests && activeProject.tests.length > 0
    ? activeProject.tests
    : (activeProject?.test_files || []).map((f) => ({
        id: f,
        name: f.split('/').pop(),
        display_name: f.split('/').pop(),
        file: f,
        execution_target: f
      }));

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="relative bg-white border-r border-custom-border flex flex-col justify-between h-screen sticky top-0 z-30 select-none shrink-0 group/sidebar"
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Top Logo Section */}
        <div className="py-4 px-5 flex items-center justify-between border-b border-custom-border shrink-0 bg-white">
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-3 cursor-pointer select-none min-w-0"
          >
            <BrandLogo size={34} />
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-base tracking-tight text-text-primary font-sans leading-tight">
                TestBench
              </span>
              <span className="text-[8px] font-extrabold font-mono text-brand tracking-wider uppercase leading-tight mt-0.5">
                TEST • VALIDATE • DELIVER
              </span>
            </div>
          </div>

          <button
            id="btn-refresh-projects"
            onClick={fetchProjects}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="Refresh Projects"
          >
            <RefreshCw className={`h-4 w-4 ${loadingProjects ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Content Area for 2 Vertical Sections */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {/* SECTION 1: Uploaded Applications */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <FolderGit2 className="h-3.5 w-3.5 text-brand" /> Uploaded Applications
              </span>
              <button
                id="btn-sidebar-upload"
                onClick={() => navigate('/')}
                className="px-2.5 py-1 rounded-custom bg-brand hover:bg-brand-hover text-white text-[11px] font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Upload Zip
              </button>
            </div>

            {loadingProjects ? (
              <div className="text-[11px] text-text-secondary py-3 text-center">Loading applications...</div>
            ) : projectsList.length === 0 ? (
              <div className="p-4 rounded-custom bg-slate-50 border border-custom-border text-center space-y-1.5">
                <Box className="h-6 w-6 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-text-primary">No applications uploaded</p>
                <button
                  onClick={() => navigate('/')}
                  className="text-[11px] text-brand hover:underline font-medium"
                >
                  Upload your first .zip
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                {projectsList.map((project) => {
                  const isSelected = activeProject?.project_name === project.project_name;
                  return (
                    <div
                      key={project.project_name}
                      id={`project-item-${project.project_name}`}
                      onClick={() => selectProject(project)}
                      className={`group flex items-center justify-between px-3 py-2.5 rounded-custom text-sm transition-all cursor-pointer border select-none ${
                        isSelected
                          ? 'bg-brand/10 border-brand/20 text-brand font-semibold'
                          : 'bg-transparent border-transparent hover:bg-slate-50 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className={`truncate text-[13px] font-medium leading-none ${isSelected ? 'text-brand font-semibold' : 'text-text-primary'}`}>
                            {project.project_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {getFrameworkBadge(project.framework || project.framework_type, project.language)}
                          <span className="text-[10px] text-text-secondary font-mono">
                            {project.test_count ?? (project.tests?.length || project.test_files?.length || 0)} tests
                          </span>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'text-brand transform translate-x-0.5' : 'text-slate-400 opacity-0 group-hover:opacity-100'}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: Discovered Tests */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-brand" /> Discovered Tests
              </span>
              {activeProject && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 border border-custom-border text-text-primary font-mono truncate max-w-[110px]">
                  {activeProject.project_name}
                </span>
              )}
            </div>

            {/* Empty state when no project is clicked */}
            {!activeProject ? (
              <div className="p-6 text-center border border-dashed border-custom-border rounded-custom bg-slate-50/50">
                <FileCode2 className="h-7 w-7 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-text-secondary font-medium leading-relaxed">
                  Select an application above to view discovered tests
                </p>
              </div>
            ) : loadingTests ? (
              <div className="text-[11px] text-text-secondary py-4 text-center flex items-center justify-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" /> Scanning tests...
              </div>
            ) : activeTestItems.length === 0 ? (
              <div className="p-4 text-center border border-custom-border rounded-custom bg-slate-50">
                <p className="text-xs font-semibold text-text-primary">No tests detected</p>
                <p className="text-[10px] text-text-secondary mt-0.5">Scanned for TestNG, JUnit, pytest, Playwright</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Search Filter inside Test Tree */}
                {activeTestItems.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={testFilter}
                      onChange={(e) => setTestFilter(e.target.value)}
                      placeholder="Filter test methods..."
                      className="w-full pl-7 pr-6 py-1 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                    {testFilter && (
                      <button
                        onClick={() => setTestFilter('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* Select All & Action Buttons Header */}
                <div className="flex items-center justify-between pt-0.5 pb-1 px-1">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <button
                      id="btn-select-all-tests"
                      onClick={() => {
                        const allTargets = activeTestItems.map((t) => t.execution_target || t.id);
                        if (selectedTests.length === allTargets.length) {
                          deselectAllTests();
                        } else {
                          selectAllTests(allTargets);
                        }
                      }}
                      className="font-bold text-brand hover:underline cursor-pointer"
                    >
                      {selectedTests.length === activeTestItems.length ? 'Clear' : 'All'}
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => {
                        const allTargets = activeTestItems.map((t) => t.execution_target || t.id);
                        const inverted = allTargets.filter((t) => !selectedTests.includes(t));
                        setSelectedTests(inverted);
                        setRunTarget(inverted.length === 0 ? 'all' : 'selected');
                      }}
                      className="text-slate-500 hover:text-slate-800 cursor-pointer"
                      title="Invert current test selection"
                    >
                      Invert
                    </button>
                    <span className="text-text-secondary font-mono text-[9px] ml-0.5">
                      ({selectedTests.length}/{activeTestItems.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      id="btn-run-selected-tests"
                      onClick={() => {
                        setRunTarget('selected');
                        if (window.location.pathname !== '/dashboard') {
                          navigate('/dashboard');
                        }
                      }}
                      disabled={selectedTests.length === 0}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-30 disabled:hover:bg-brand transition cursor-pointer"
                      title="Run only selected tests"
                    >
                      Run ({selectedTests.length})
                    </button>
                    <button
                      id="btn-run-all-tests"
                      onClick={() => {
                        deselectAllTests();
                        setRunTarget('all');
                        if (window.location.pathname !== '/dashboard') {
                          navigate('/dashboard');
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white hover:bg-slate-900 transition cursor-pointer"
                      title="Run all project tests"
                    >
                      All
                    </button>
                  </div>
                </div>

                {/* Discovered Tests List */}
                <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                  {activeTestItems
                    .filter((t) => {
                      const q = testFilter.toLowerCase().trim();
                      if (!q) return true;
                      return (
                        (t.display_name || '').toLowerCase().includes(q) ||
                        (t.name || '').toLowerCase().includes(q) ||
                        (t.class_name || '').toLowerCase().includes(q) ||
                        (t.file || '').toLowerCase().includes(q)
                      );
                    })
                    .map((testItem, idx) => {
                      const targetKey = testItem.execution_target || testItem.id;
                      const isChecked = selectedTests.includes(targetKey);
                      const isTestSelected = selectedTest === targetKey;
                      const displayName = testItem.display_name || testItem.name;
                      const isCopied = copiedTarget === targetKey;

                      return (
                        <div
                          key={idx}
                          id={`test-file-item-${idx}`}
                          className={`group px-2.5 py-1.5 rounded-custom border text-xs transition-all flex items-center justify-between select-none ${
                            isChecked || isTestSelected
                              ? 'bg-brand/10 border-brand/20 text-brand font-semibold'
                              : 'bg-transparent border-transparent hover:bg-slate-50 text-text-secondary hover:text-text-primary'
                          }`}
                          title={targetKey}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleTestSelection(targetKey)}
                              className="rounded border-slate-300 text-brand focus:ring-brand cursor-pointer shrink-0"
                            />
                            <div
                              onClick={() => {
                                setSelectedTest(targetKey);
                                toggleTestSelection(targetKey);
                                if (window.location.pathname !== '/dashboard') {
                                  navigate('/dashboard');
                                }
                              }}
                              className="min-w-0 flex-1 cursor-pointer"
                            >
                              <p className={`truncate text-[11px] ${isChecked || isTestSelected ? 'text-brand font-semibold' : 'text-text-primary'}`}>
                                {displayName}
                              </p>
                              <p className="text-[9px] text-text-secondary font-mono truncate">
                                {testItem.class_name ? `${testItem.class_name} • ` : ''}{testItem.file}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(targetKey);
                              setCopiedTarget(targetKey);
                              setTimeout(() => setCopiedTarget(''), 2000);
                              showToast(`Copied test target: ${displayName}`, 'info', 1500);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0 ml-1"
                            title="Copy Test Target Path"
                          >
                            {isCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Area */}
        <div className="p-4 border-t border-custom-border bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span className="font-mono text-[10px]">TestBench v1.0.0</span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Ready
            </span>
          </div>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={startResizing}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand/40 active:bg-brand transition-colors z-40"
        title="Drag to resize sidebar"
      />
    </aside>
  );
}
