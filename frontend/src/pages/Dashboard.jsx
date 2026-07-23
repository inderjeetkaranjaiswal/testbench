import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Activity, Server, FolderGit2, CheckCircle2, RefreshCw, Upload, Rocket, FileCode2, FolderTree, Trash2, Folder, File, ChevronRight, ChevronDown, Sparkles, Play, FlaskConical, Terminal } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';
import LogisticsView from '../components/LogisticsView.jsx';
import EmulatorView from '../components/EmulatorView.jsx';
import TerminalView from '../components/TerminalView.jsx';
import DeviceInfoPanel from '../components/DeviceInfoPanel.jsx';
import ExecutionStatsPanel from '../components/ExecutionStatsPanel.jsx';

function DirectoryTreeNode({ node, level = 0 }) {
  const [isOpen, setIsOpen] = useState(level < 2);

  if (node.type === 'file') {
    return (
      <div className="flex items-center gap-2 py-1 px-2 hover:bg-slate-800/40 rounded-md text-xs font-mono transition" style={{ paddingLeft: `${level * 16 + 8}px` }}>
        <File className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        <span className="text-slate-200">{node.name}</span>
        <span className="text-[10px] text-slate-500 ml-auto">{(node.size_bytes / 1024).toFixed(1)} KB</span>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-1 px-2 hover:bg-slate-800/60 rounded-md text-xs font-mono font-semibold cursor-pointer text-slate-200 transition"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-amber-200/90">{node.name}</span>
        <span className="text-[10px] text-slate-500 font-normal ml-auto">({node.children?.length || 0} items)</span>
      </div>
      {isOpen && node.children && (
        <div className="space-y-0.5">
          {node.children.map((child, idx) => (
            <DirectoryTreeNode key={idx} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const location = useLocation();
  const { activeProject, selectedTest, selectedTests, runTarget } = useProject();
  const [health, setHealth] = useState(null);

  const currentProject = location.state?.project || activeProject;

  const getTestRunCommand = () => {
    const framework = currentProject?.framework_type?.toLowerCase();
    let targetFiles = [];
    if (runTarget === 'selected' && selectedTests && selectedTests.length > 0) {
      targetFiles = selectedTests;
    } else if (selectedTest) {
      targetFiles = [selectedTest];
    }

    if (framework === 'maven') {
      if (targetFiles.length > 0) {
        const classNames = targetFiles.map((f) => f.split('/').pop().replace('.java', ''));
        return `mvn test -Dtest=${classNames.join(',')}`;
      }
      return `mvn test`;
    } else if (framework === 'playwright') {
      if (targetFiles.length > 0) {
        return `npx playwright test ${targetFiles.join(' ')}`;
      }
      return `npx playwright test`;
    }
    if (targetFiles.length > 0) {
      return `npm test -- ${targetFiles.join(' ')}`;
    }
    return `npm test`;
  };

  const hasTarget = (runTarget === 'selected' && selectedTests.length > 0) || selectedTest;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1800px] mx-auto min-h-screen flex flex-col bg-custom-bg select-none">
      {/* Selected Test Execution Banner */}
      {hasTarget && (
        <div className="bg-white p-4 rounded-custom border border-brand/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-custom bg-brand/10 text-brand border border-brand/20">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-brand uppercase tracking-wider">Test Suite Prepared for Execution</span>
              <h2 className="text-base font-extrabold text-text-primary font-mono">
                {selectedTests.length > 0 ? `${selectedTests.length} Selected Test Classes` : selectedTest ? selectedTest.split('/').pop() : 'All Tests'}
              </h2>
            </div>
          </div>
          <div className="p-2 rounded-custom bg-slate-50 border border-custom-border flex items-center gap-2 font-mono text-xs">
            <Terminal className="h-4 w-4 text-brand shrink-0" />
            <code className="text-text-primary font-bold">{getTestRunCommand()}</code>
          </div>
        </div>
      )}

      {/* Active Uploaded Project Quick Details */}
      {currentProject && (
        <div className="bg-white p-4 rounded-custom border border-custom-border shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-custom bg-brand/10 border border-brand/20 text-brand">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Active Application</span>
              <h3 className="text-base font-bold text-text-primary">{currentProject.project_name}</h3>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-custom bg-slate-50 border border-custom-border text-text-secondary">
              {currentProject.framework_type || 'Custom'} Project
            </span>
            <span className="px-2.5 py-1 rounded-custom bg-brand/10 border border-brand/20 text-brand font-bold">
              {currentProject.test_count ?? currentProject.test_files?.length ?? 0} tests detected
            </span>
          </div>
        </div>
      )}

      {/* MASTER WORKBENCH RESPONSIVE CSS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: LogisticsView & Advanced Device Information */}
        <div className="lg:col-span-6 w-full space-y-6">
          <LogisticsView />
          <DeviceInfoPanel />
        </div>

        {/* RIGHT COLUMN: EmulatorView (Interactive 2-Way Mirror & Action Controls) */}
        <div className="lg:col-span-6 w-full space-y-6">
          <EmulatorView />
        </div>

        {/* ENTIRE BOTTOM ROW: TerminalView (Xterm.js Live Streaming Logs Console) */}
        <div className="lg:col-span-12 w-full h-[500px]">
          <TerminalView />
        </div>
      </div>
    </div>
  );
}
