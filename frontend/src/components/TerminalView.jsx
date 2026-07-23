import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { Play, Download, Search, Square, RefreshCw, CheckCircle2, XCircle, Terminal as TerminalIcon, Sparkles } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function TerminalView() {
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const wsRef = useRef(null);

  const {
    activeProject,
    selectedTest,
    selectedTests,
    runTarget,
    setGeneratedReport,
    setIsExecuting,
    setExecutionStats,
    setOperatingMode
  } = useProject();

  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'running' | 'success' | 'failed'
  const [searchQuery, setSearchQuery] = useState('');
  const [logBuffer, setLogBuffer] = useState([]);

  // Initialize XTerm.js terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#020617', // slate-950
        foreground: '#f8fafc', // slate-50
        cursor: '#6366f1',     // indigo-500
        selectionBackground: 'rgba(99, 102, 241, 0.4)',
        black: '#0f172a',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#f8fafc',
      },
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    term.writeln('\x1b[1;36m=== TestBench XTerm.js Terminal Initialized ===\x1b[0m');
    term.writeln('\x1b[90mSelect an application from the sidebar and click "Run Test" to stream execution logs.\x1b[0m');
    term.writeln('');

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch (e) {
        // Ignore fit error if unmounting
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, []);

  // Handle Search in Terminal
  useEffect(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery, { incremental: true });
    }
  }, [searchQuery]);

  const handleRunTest = () => {
    if (!activeProject) {
      alert('Please select an uploaded application from the sidebar first.');
      return;
    }

    if (isRunning && wsRef.current) {
      wsRef.current.close();
      setIsRunning(false);
      setIsExecuting(false);
      setStatus('idle');
      return;
    }

    const term = xtermInstance.current;
    if (!term) return;

    term.clear();
    term.reset();
    setLogBuffer([]);
    setIsRunning(true);
    setIsExecuting(true);
    setOperatingMode('view'); // Safety Lock
    setStatus('running');

    const startTime = Date.now();
    let targetFiles = [];
    if (runTarget === 'selected' && selectedTests && selectedTests.length > 0) {
      targetFiles = selectedTests;
    } else if (selectedTest) {
      targetFiles = [selectedTest];
    }
    const testCount = targetFiles.length || (activeProject?.test_files?.length || 1);

    setExecutionStats((prev) => ({
      ...prev,
      startTime,
      endTime: null,
      completedTests: 0,
      totalTests: testCount,
      totalTestsRemaining: testCount,
    }));

    term.writeln(`\x1b[1;34m[TESTBENCH]\x1b[0m Connecting to WebSocket runner for project: \x1b[1;33m${activeProject.project_name}\x1b[0m...`);

    if (targetFiles.length > 0) {
      term.writeln(`\x1b[1;34m[TESTBENCH]\x1b[0m Execution Target (${targetFiles.length} tests): \x1b[1;32m${targetFiles.join(', ')}\x1b[0m`);
    } else {
      term.writeln(`\x1b[1;34m[TESTBENCH]\x1b[0m Execution Target: \x1b[1;32mALL Project Tests\x1b[0m`);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}/ws/execute/${encodeURIComponent(activeProject.project_name)}`;
    if (targetFiles.length > 0) {
      wsUrl += `?test_file=${encodeURIComponent(targetFiles.join(','))}`;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        term.writeln('\x1b[1;32m[WS CONNECTED]\x1b[0m Socket connection established.');
        term.writeln('');
      };

      ws.onmessage = (event) => {
        const text = event.data;
        if (text.startsWith('[KEEPALIVE]')) {
          return;
        }
        setLogBuffer((prev) => [...prev, text]);

        // Check for individual test time logs (e.g. "Time elapsed: 8.4 s -- in com.example.DashboardTest")
        if (text.includes('Time elapsed:') && text.includes('s')) {
          try {
            const timeMatch = text.match(/Time elapsed:\s*([\d\.]+)\s*s/);
            let className = targetFiles.length === 1 ? targetFiles[0].split('/').pop() : 'TestClass';
            if (text.includes('-- in ')) {
              const classMatch = text.split('-- in ')[1].trim();
              const simpleName = classMatch.split('.').pop();
              className = simpleName.endsWith('.java') ? simpleName : `${simpleName}.java`;
            }

            if (timeMatch) {
              const dur = parseFloat(timeMatch[1]);
              setExecutionStats((prev) => {
                const fDet = (!prev.fastestTestDetails || dur < prev.fastestTestDetails.time) ? { name: className, time: dur } : prev.fastestTestDetails;
                const sDet = (!prev.slowestTestDetails || dur > prev.slowestTestDetails.time) ? { name: className, time: dur } : prev.slowestTestDetails;
                return {
                  ...prev,
                  fastestTestDetails: fDet,
                  slowestTestDetails: sDet,
                };
              });
            }
          } catch (e) {}
        }

        // Check for total duration in logs
        if (text.includes('[PROFILE] TOTAL PIPELINE EXECUTION DURATION:')) {
          try {
            const match = text.match(/DURATION:\s*([\d\.]+)s/);
            if (match) {
              const durSec = parseFloat(match[1]);
              const avg = durSec / Math.max(1, testCount);
              const singleTestName = targetFiles.length > 0 ? targetFiles[0].split('/').pop() : 'TestClass.java';
              
              setExecutionStats((prev) => ({
                ...prev,
                totalExecutionTime: durSec,
                averageTimePerTest: avg,
                fastestTest: prev.fastestTest === 0 ? avg : Math.min(prev.fastestTest, avg),
                slowestTest: Math.max(prev.slowestTest, avg),
                fastestTestDetails: prev.fastestTestDetails || { name: singleTestName, time: durSec },
                slowestTestDetails: prev.slowestTestDetails || { name: singleTestName, time: durSec },
                estimatedRemainingTime: 0,
                totalTestsRemaining: 0,
              }));
            }
          } catch (e) {}
        }

        // Check if message is a JSON payload from Watchdog for REPORT_GENERATED
        try {
          if (text.startsWith('{') && text.endsWith('}')) {
            const data = JSON.parse(text);
            if (data.type === 'REPORT_GENERATED') {
              setGeneratedReport(data);
              term.writeln(`\x1b[1;33m[REPORT DETECTED]\x1b[0m Excel report generated: \x1b[1;32m${data.file_name}\x1b[0m`);
              term.writeln(`\x1b[1;36m[REPORT LINK]\x1b[0m Download available in header bar: \x1b[4;36m${data.download_url}\x1b[0m`);
              term.scrollToBottom();
              return;
            }
          }
        } catch (e) {
          // Not a JSON payload, process as regular log output line
        }

        // Colorize output lines in xterm
        if (text.includes('[STDERR]') || text.includes('FAIL') || text.includes('ERROR') || text.includes('Exception')) {
          term.writeln(`\x1b[31m${text}\x1b[0m`);
        } else if (text.includes('[RUNNER FINISHED]')) {
          const endTime = Date.now();
          setIsExecuting(false);
          setExecutionStats((prev) => ({
            ...prev,
            endTime,
            totalExecutionTime: (endTime - startTime) / 1000,
            estimatedRemainingTime: 0,
            totalTestsRemaining: 0,
          }));

          if (text.includes('code 0')) {
            term.writeln(`\x1b[1;32m${text}\x1b[0m`);
            setStatus('success');
          } else {
            term.writeln(`\x1b[1;31m${text}\x1b[0m`);
            setStatus('failed');
          }
        } else if (text.includes('[RUNNER]') || text.includes('[WATCHDOG]') || text.includes('BUILD SUCCESS')) {
          term.writeln(`\x1b[1;32m${text}\x1b[0m`);
        } else {
          term.writeln(text);
        }

        // Auto-scroll to bottom
        term.scrollToBottom();
      };

      ws.onerror = (err) => {
        term.writeln('\x1b[1;31m[WS ERROR]\x1b[0m Failed to connect or stream execution logs.');
        setIsRunning(false);
        setIsExecuting(false);
        setStatus('failed');
      };

      ws.onclose = () => {
        setIsRunning(false);
        setIsExecuting(false);
        if (status === 'running') {
          setStatus('idle');
        }
      };
    } catch (e) {
      term.writeln(`\x1b[1;31m[ERROR]\x1b[0m ${e.message}`);
      setIsRunning(false);
      setIsExecuting(false);
      setStatus('failed');
    }
  };

  const handleDownloadLogs = () => {
    if (logBuffer.length === 0) {
      alert('No logs recorded to download.');
      return;
    }

    const blob = new Blob([logBuffer.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject?.project_name || 'testbench'}_logs_${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-custom border border-custom-border shadow-xs overflow-hidden select-none">
      {/* Control Header Bar */}
      <div className="px-5 py-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            id="btn-run-test"
            onClick={handleRunTest}
            className={`px-4 py-2 rounded-custom text-xs font-bold shadow-xs flex items-center gap-2 transition cursor-pointer ${
              isRunning
                ? 'bg-failed hover:bg-red-600 text-white animate-pulse'
                : 'bg-brand hover:bg-brand-hover text-white'
            }`}
          >
            {isRunning ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {isRunning ? 'Stop Execution' : 'Run Test'}
          </button>

          {/* Active Target Info */}
          <div className="hidden sm:flex flex-col">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider font-bold">Execution Target</span>
            <span className="text-xs font-mono font-semibold text-text-primary truncate max-w-xs">
              {activeProject ? activeProject.project_name : 'No App Selected'}
              {selectedTest ? ` → ${selectedTest.split('/').pop()}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-50 border-custom-border">
            {status === 'running' && (
              <>
                <RefreshCw className="h-3 w-3 text-brand animate-spin" />
                <span className="text-brand">Running...</span>
              </>
            )}
            {status === 'success' && (
              <>
                <CheckCircle2 className="h-3 w-3 text-success" />
                <span className="text-success">Passed</span>
              </>
            )}
            {status === 'failed' && (
              <>
                <XCircle className="h-3 w-3 text-failed" />
                <span className="text-failed">Failed</span>
              </>
            )}
            {status === 'idle' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span className="text-text-secondary">Idle</span>
              </>
            )}
          </div>

          {/* Search Input */}
          <div className="relative w-36 sm:w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              id="log-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="w-full bg-slate-50 border border-custom-border rounded-custom pl-8 pr-2.5 py-1 text-[11px] text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand transition font-mono"
            />
          </div>

          {/* Download Logs Button */}
          <button
            id="btn-download-logs"
            onClick={handleDownloadLogs}
            disabled={logBuffer.length === 0}
            className="p-1.5 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-slate-50 transition cursor-pointer"
            title="Download Logs as .log file"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* XTerm.js Terminal Container */}
      <div className="flex-1 p-3 bg-slate-950 overflow-hidden relative terminal-scrollbar">
        <div ref={terminalRef} className="w-full h-full text-left" />
      </div>
    </div>
  );
}
