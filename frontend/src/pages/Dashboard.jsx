import React, { useEffect, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Server,
  FolderGit2,
  CheckCircle2,
  RefreshCw,
  Upload,
  Rocket,
  FileCode2,
  FolderTree,
  Trash2,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Play,
  FlaskConical,
  Terminal,
  Boxes,
  ArrowRight,
  ArrowUpRight
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';
import LogisticsView from '../components/LogisticsView.jsx';
import EmulatorView from '../components/EmulatorView.jsx';
import ExecutionHistory from '../components/ExecutionHistory.jsx';
import DeviceInfoPanel from '../components/DeviceInfoPanel.jsx';
import ExecutionSummaryCard from '../components/ExecutionSummaryCard.jsx';
import DeviceSelector from '../components/DeviceSelector.jsx';

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeProject,
    selectedTest,
    selectedTests,
    runTarget,
    projectsList,
    selectProject,
    showToast
  } = useProject();

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

  const [copiedCmd, setCopiedCmd] = useState(false);

  const handleCopyCommand = () => {
    const cmd = getTestRunCommand();
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
    showToast('Command copied to clipboard', 'success', 2000);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1800px] mx-auto min-h-screen flex flex-col bg-custom-bg select-none">
      {/* If No Project is selected yet, show an interactive Quick Project Picker */}
      {!currentProject && (
        <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <Boxes className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Select a Test Application to Begin</h2>
                <p className="text-xs text-slate-500">Pick any detected test automation suite or upload a new archive to load tests into the workbench.</p>
              </div>
            </div>
            <Link
              to="/"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer self-start sm:self-auto"
            >
              <Upload className="h-4 w-4" />
              Upload Project ZIP
            </Link>
          </div>

          {projectsList && projectsList.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {projectsList.map((proj, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    await selectProject(proj);
                    showToast(`Loaded ${proj.project_name} in Workbench`, 'success');
                  }}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition text-left flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-0.5 truncate">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition block truncate">
                      {proj.project_name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {proj.test_count ?? proj.test_files?.length ?? 0} tests detected
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected Test Execution Banner with 1-Click Copy */}
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
          <div className="flex items-center gap-2">
            <div className="p-2 px-3 rounded-custom bg-slate-50 border border-custom-border flex items-center gap-2 font-mono text-xs max-w-lg truncate">
              <Terminal className="h-4 w-4 text-brand shrink-0" />
              <code className="text-text-primary font-bold truncate">{getTestRunCommand()}</code>
            </div>
            <button
              onClick={handleCopyCommand}
              className="p-2 rounded-custom bg-white hover:bg-slate-50 border border-custom-border text-slate-600 hover:text-slate-900 transition flex items-center gap-1 text-xs font-semibold shadow-xs cursor-pointer shrink-0"
              title="Copy Command to Clipboard"
            >
              {copiedCmd ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
              <span className="text-[11px] hidden sm:inline">{copiedCmd ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Uploaded Project Quick Details & Switcher */}
      {currentProject && (
        <div className="bg-white p-4 rounded-custom border border-custom-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-custom bg-brand/10 border border-brand/20 text-brand">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Active Application</span>
              <h3 className="text-base font-bold text-text-primary">{currentProject.project_name}</h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-custom bg-slate-50 border border-custom-border text-text-secondary">
              {currentProject.framework_type || 'Custom'} Project
            </span>
            <span className="px-2.5 py-1 rounded-custom bg-brand/10 border border-brand/20 text-brand font-bold">
              {currentProject.test_count ?? currentProject.test_files?.length ?? 0} tests detected
            </span>

            {/* Quick Switch Dropdown if multiple projects */}
            {projectsList.length > 1 && (
              <select
                value={currentProject.project_name}
                onChange={async (e) => {
                  const target = projectsList.find((p) => p.project_name === e.target.value);
                  if (target) {
                    await selectProject(target);
                    showToast(`Switched to ${target.project_name}`, 'info');
                  }
                }}
                className="px-2.5 py-1 rounded-custom bg-white border border-custom-border text-text-primary text-xs font-sans focus:outline-none focus:border-brand cursor-pointer"
              >
                {projectsList.map((p, idx) => (
                  <option key={idx} value={p.project_name}>
                    {p.project_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Target Execution Device Selector */}
      <DeviceSelector />

      {/* MASTER WORKBENCH RESPONSIVE CSS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: LogisticsView, Advanced Device Information & Execution Summary */}
        <div className="lg:col-span-6 w-full space-y-6">
          <LogisticsView />
          <DeviceInfoPanel />
          <ExecutionSummaryCard />
        </div>

        {/* RIGHT COLUMN: EmulatorView (Interactive 2-Way Mirror & Action Controls) */}
        <div className="lg:col-span-6 w-full space-y-6">
          <EmulatorView />
        </div>

        {/* ENTIRE BOTTOM ROW: ExecutionHistory (Log Files & Background Execution Status) */}
        <div className="lg:col-span-12 w-full">
          <ExecutionHistory />
        </div>
      </div>
    </div>
  );
}
