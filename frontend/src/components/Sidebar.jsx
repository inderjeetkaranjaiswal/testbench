import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Layers, Plus, FolderGit2, FlaskConical, FileCode2, ChevronRight, LayoutDashboard, FolderKanban, Terminal, Settings, RefreshCw, Box, Play, Cpu, GripVertical } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function Sidebar() {
  const navigate = useNavigate();
  const {
    activeProject,
    selectedTest,
    setSelectedTest,
    selectedTests,
    toggleTestSelection,
    selectAllTests,
    deselectAllTests,
    setRunTarget,
    projectsList,
    loadingProjects,
    loadingTests,
    fetchProjects,
    selectProject,
  } = useProject();

  // Sidebar resizing state (min: 200px, max: 550px, default: 290px)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('testbench_sidebar_width');
    return saved ? parseInt(saved, 10) : 290;
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

  const getFrameworkBadge = (framework) => {
    switch (framework?.toLowerCase()) {
      case 'maven':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Maven</span>;
      case 'playwright':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">Playwright</span>;
      case 'javascript':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">JS</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">App</span>;
    }
  };

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
                          {getFrameworkBadge(project.framework_type)}
                          <span className="text-[10px] text-text-secondary font-mono">
                            {project.test_count ?? 0} tests
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

          {/* SECTION 2: Application Tests */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-brand" /> Application Tests
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
                  Select an application above to view tests
                </p>
              </div>
            ) : loadingTests ? (
              <div className="text-[11px] text-text-secondary py-4 text-center flex items-center justify-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" /> Fetching test files...
              </div>
            ) : !activeProject.test_files || activeProject.test_files.length === 0 ? (
              <div className="p-4 text-center border border-custom-border rounded-custom bg-slate-50">
                <p className="text-xs font-semibold text-text-primary">No test files detected</p>
                <p className="text-[10px] text-text-secondary mt-0.5">Scanned for *Test.java, *.spec.ts, *.test.ts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select All & Action Buttons Header */}
                <div className="flex items-center justify-between pt-1 pb-1 px-1">
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-select-all-tests"
                      onClick={() => {
                        if (selectedTests.length === activeProject.test_files.length) {
                          deselectAllTests();
                        } else {
                          selectAllTests();
                        }
                      }}
                      className="text-[10px] font-bold text-brand hover:underline cursor-pointer"
                    >
                      {selectedTests.length === activeProject.test_files.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-[10px] text-text-secondary font-mono">
                      ({selectedTests.length}/{activeProject.test_files.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
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
                      Run Selected
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
                      Run All
                    </button>
                  </div>
                </div>

                {/* Discovered Test Files List */}
                <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                  {activeProject.test_files.map((testPath, idx) => {
                    const fileName = testPath.split('/').pop();
                    const isChecked = selectedTests.includes(testPath);
                    const isTestSelected = selectedTest === testPath;

                    return (
                      <div
                        key={idx}
                        id={`test-file-item-${idx}`}
                        className={`px-2.5 py-2 rounded-custom border text-xs transition-all flex items-center justify-between select-none ${
                          isChecked || isTestSelected
                            ? 'bg-brand/10 border-brand/20 text-brand font-semibold'
                            : 'bg-transparent border-transparent hover:bg-slate-50 text-text-secondary hover:text-text-primary'
                        }`}
                        title={testPath}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTestSelection(testPath)}
                            className="rounded border-slate-300 text-brand focus:ring-brand cursor-pointer shrink-0"
                          />
                          <div
                            onClick={() => {
                              setSelectedTest(testPath);
                              toggleTestSelection(testPath);
                              if (window.location.pathname !== '/dashboard') {
                                navigate('/dashboard');
                              }
                            }}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <p className={`truncate text-[12px] ${isChecked || isTestSelected ? 'text-brand font-semibold' : 'text-text-primary'}`}>{fileName}</p>
                            <p className="text-[9px] text-text-secondary font-mono truncate">{testPath}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedTest(testPath);
                            if (!selectedTests.includes(testPath)) {
                              toggleTestSelection(testPath);
                            }
                            if (window.location.pathname !== '/dashboard') {
                              navigate('/dashboard');
                            }
                          }}
                          className={`p-1 rounded text-[10px] transition ${
                            isChecked ? 'bg-brand/20 text-brand' : 'text-slate-400 hover:text-slate-600'
                          }`}
                          title="Run single test"
                        >
                          <Play className="h-3 w-3 fill-current" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Status Bar */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-text-secondary bg-white shrink-0">
          <div className="flex items-center gap-2 select-none">
            <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse"></div>
            <span>Platform Status: Live</span>
          </div>
          <span>v1.0.0</span>
        </div>
      </div>

      {/* Resize Handle Handle on Right Border */}
      <div
        id="sidebar-resize-handle"
        onMouseDown={startResizing}
        className={`absolute top-0 right-0 w-2 h-full cursor-col-resize transition-all z-40 flex items-center justify-center hover:bg-blue-500/20 group/handle ${
          isResizing ? 'bg-blue-500/30' : 'bg-transparent'
        }`}
        title="Drag to resize sidebar"
      >
        <div
          className={`w-1 h-12 rounded-full transition-colors ${
            isResizing ? 'bg-blue-600' : 'bg-slate-300 group-hover/handle:bg-blue-500'
          }`}
        />
      </div>
    </aside>
  );
}
