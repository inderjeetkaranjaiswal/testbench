import React, { useEffect, useState, useRef } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  FileText,
  Eye,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  Sparkles,
  X,
  Copy,
  Search,
  Check,
  Video
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function ExecutionHistory() {
  const {
    activeProject,
    selectedTest,
    selectedTests,
    runTarget,
    selectedDevice,
    setIsExecuting,
    setExecutionStats,
    setOperatingMode,
    showToast
  } = useProject();

  const [statusData, setStatusData] = useState({ status: 'Idle', log_file: null });
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedLogModal, setSelectedLogModal] = useState(null); // { filename, content, loading }
  const [selectedVideoModal, setSelectedVideoModal] = useState(null); // { filename, title }
  const [copied, setCopied] = useState(false);

  const pollTimerRef = useRef(null);

  // Poll status & logs periodically or when activeProject changes
  const fetchStatusAndLogs = async () => {
    if (!activeProject?.project_name) return;

    try {
      // 1. Fetch current status
      const statusResp = await fetch(`/api/status/${encodeURIComponent(activeProject.project_name)}`);
      if (statusResp.ok) {
        const sData = await statusResp.json();
        setStatusData(sData);

        if (sData.status === 'Running') {
          setIsExecuting(true);
        } else {
          setIsExecuting(false);
        }
      }

      // 2. Fetch log files list
      setLoadingLogs(true);
      const logsResp = await fetch(`/api/logs/${encodeURIComponent(activeProject.project_name)}`);
      if (logsResp.ok) {
        const lData = await logsResp.json();
        setLogsList(lData.logs || []);
      }
    } catch (err) {
      console.error('[ExecutionHistory] Fetch error:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchStatusAndLogs();

    // Start polling every 1.5 seconds
    pollTimerRef.current = setInterval(() => {
      fetchStatusAndLogs();
    }, 1500);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [activeProject]);

  const handleRunTest = async () => {
    if (!activeProject) {
      showToast('Please select an application from the sidebar first', 'warning');
      return;
    }

    setIsExecuting(true);
    setOperatingMode('view');
    setStatusData((prev) => ({ ...prev, status: 'Running' }));
    showToast(`Triggered test suite for ${activeProject.project_name}`, 'info');

    let targetFiles = [];
    if (runTarget === 'selected' && selectedTests && selectedTests.length > 0) {
      targetFiles = selectedTests;
    } else if (selectedTest) {
      targetFiles = [selectedTest];
    }

    let executeUrl = `/api/execute/${encodeURIComponent(activeProject.project_name)}`;
    const queryParams = [];
    if (targetFiles.length > 0) {
      queryParams.push(`test_file=${encodeURIComponent(targetFiles.join(','))}`);
    }
    if (selectedDevice?.id) {
      queryParams.push(`device_id=${encodeURIComponent(selectedDevice.id)}`);
    }
    if (queryParams.length > 0) {
      executeUrl += `?${queryParams.join('&')}`;
    }

    try {
      const resp = await fetch(executeUrl, { method: 'POST' });
      if (!resp.ok) {
        throw new Error(`Execution trigger failed with status ${resp.status}`);
      }
      fetchStatusAndLogs();
    } catch (e) {
      showToast(`Execution Error: ${e.message}`, 'error');
      setIsExecuting(false);
      setStatusData((prev) => ({ ...prev, status: 'Failed' }));
    }
  };

  const handleViewLog = async (filename) => {
    setSelectedLogModal({ filename, content: '', loading: true });
    setCopied(false);

    try {
      const resp = await fetch(`/api/logs/${encodeURIComponent(activeProject.project_name)}/${encodeURIComponent(filename)}`);
      if (!resp.ok) throw new Error('Failed to load log content');
      const data = await resp.json();
      setSelectedLogModal({ filename, content: data.content || '', loading: false });
    } catch (err) {
      setSelectedLogModal({ filename, content: `Error loading log: ${err.message}`, loading: false });
    }
  };

  const handleDownloadLog = (filename) => {
    const downloadUrl = `/api/logs/${encodeURIComponent(activeProject.project_name)}/${encodeURIComponent(filename)}?download=true`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading ${filename}`, 'info', 2000);
  };

  const handleCopyContent = () => {
    if (selectedLogModal?.content) {
      navigator.clipboard.writeText(selectedLogModal.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Log content copied to clipboard', 'success');
    }
  };

  const filteredLogs = logsList.filter((log) =>
    log.filename.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const isRunning = statusData.status === 'Running';

  return (
    <div className="flex flex-col h-full bg-white rounded-custom border border-custom-border shadow-xs overflow-hidden select-none">
      {/* Component Control Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-custom bg-brand/10 border border-brand/20 text-brand">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-text-primary flex items-center gap-2">
              Execution & Log History
            </h2>
            <p className="text-xs text-text-secondary">
              {activeProject ? `Project: ${activeProject.project_name}` : 'No active application selected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border bg-slate-50 border-custom-border">
            {isRunning ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                <span className="text-amber-600 font-bold">Running Test Suite...</span>
              </>
            ) : statusData.status === 'Completed' ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600 font-bold">Completed</span>
              </>
            ) : statusData.status === 'Failed' ? (
              <>
                <XCircle className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-rose-600 font-bold">Failed</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span className="text-slate-500">Idle</span>
              </>
            )}
          </div>

          {/* Search Logs Filter */}
          <div className="relative w-40 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter log history..."
              className="w-full bg-slate-50 border border-custom-border rounded-custom pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand transition font-mono"
            />
          </div>

          {/* Trigger Test Run Button */}
          <button
            onClick={handleRunTest}
            disabled={!activeProject || isRunning}
            className={`px-4 py-2 rounded-custom text-xs font-bold shadow-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isRunning
                ? 'bg-amber-500 text-white animate-pulse'
                : 'bg-brand hover:bg-brand-hover text-white'
            }`}
          >
            {isRunning ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            {isRunning ? 'Execution in Progress...' : 'Run Test'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto min-h-[300px]">
        {/* Sleek Running Spinner state when test is currently executing */}
        {isRunning && (
          <div className="mb-6 p-6 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-3 border-amber-500/20 border-t-amber-500 animate-spin"></div>
                <Sparkles className="h-4 w-4 text-amber-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Background Test Execution Running</h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Subprocess output is streaming directly into log file <span className="font-semibold text-amber-600">{statusData.log_file || 'generating...'}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 text-amber-700 text-xs font-mono font-bold">
                <Clock className="h-3.5 w-3.5 animate-pulse" /> Active Pipeline
              </div>
              {statusData.execution_id && (
                <button
                  onClick={async () => {
                    try {
                      await fetch(`/api/executions/${encodeURIComponent(statusData.execution_id)}/cancel`, { method: 'POST' });
                      fetchStatusAndLogs();
                    } catch (e) {
                      console.error('Failed to cancel execution:', e);
                    }
                  }}
                  className="px-3 py-1 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-700 font-sans font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Square className="h-3 w-3 fill-current" /> Cancel Run
                </button>
              )}
            </div>
          </div>
        )}

        {/* Logs Table */}
        {!activeProject ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <FileText className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
            <p className="text-sm font-medium">Select an application from the sidebar to view execution history.</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <FileText className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
            <p className="text-sm font-medium">No execution logs found for {activeProject.project_name}.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Run Test" above to start an automated test pipeline.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider font-mono">
                <tr>
                  <th className="py-3 px-4">Log File</th>
                  <th className="py-3 px-4">Created Timestamp</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredLogs.map((log, index) => {
                  const isLatest = index === 0 && isRunning;
                  return (
                    <tr key={log.filename} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-semibold text-slate-800 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                        <span className="truncate max-w-xs">{log.filename}</span>
                        {index === 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase">
                            Latest
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {(log.size_bytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const recName = log.filename.replace('.log', '.mp4');
                              setSelectedVideoModal({
                                filename: recName,
                                title: `${activeProject?.project_name} - ${log.filename.replace('.log', '')}`
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-md border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 font-sans font-semibold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            title="Watch Screen Recording"
                          >
                            <Video className="h-3.5 w-3.5 text-indigo-600" /> Watch Video
                          </button>
                          <button
                            onClick={() => handleViewLog(log.filename)}
                            className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-sans font-semibold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-indigo-600" /> View Log
                          </button>
                          <button
                            onClick={() => handleDownloadLog(log.filename)}
                            className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-sans font-semibold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5 text-slate-600" /> Download .log
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Video Screen Recording Modal */}
      {selectedVideoModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-950 text-slate-100 rounded-xl border border-slate-800 shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">{selectedVideoModal.title}</h3>
                  <p className="text-[11px] text-slate-400">Synchronized Device Screen Recording (.mp4)</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/recordings/${encodeURIComponent(selectedVideoModal.filename)}?download=true`}
                  download
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Download .mp4
                </a>
                <button
                  onClick={() => setSelectedVideoModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Video Player Body */}
            <div className="p-4 bg-slate-950 flex items-center justify-center">
              <video
                controls
                autoPlay
                src={`/api/recordings/${encodeURIComponent(selectedVideoModal.filename)}`}
                className="w-full max-h-[70vh] rounded-lg bg-black object-contain shadow-inner"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      )}

      {/* Raw Text Log View Modal */}
      {selectedLogModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-950 text-slate-100 rounded-xl border border-slate-800 shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">{selectedLogModal.filename}</h3>
                  <p className="text-[11px] text-slate-400">Raw execution output log</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyContent}
                  disabled={selectedLogModal.loading || !selectedLogModal.content}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => handleDownloadLog(selectedLogModal.filename)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
                <button
                  onClick={() => setSelectedLogModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div className="flex-1 p-4 overflow-y-auto bg-slate-950 font-mono text-xs leading-relaxed text-slate-200">
              {selectedLogModal.loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
                  <span>Loading log file content...</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] select-text">
                  {selectedLogModal.content || 'Log file is empty.'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
