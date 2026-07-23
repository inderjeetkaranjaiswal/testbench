import React, { useEffect, useState } from 'react';
import { Timer, Clock, Zap, Flame, CheckCircle2, Play } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function ExecutionSummaryCard() {
  const { executionStats, isExecuting } = useProject();
  const [elapsedSec, setElapsedSec] = useState(0);

  // Live timer tick during execution
  useEffect(() => {
    let timer = null;
    if (isExecuting && executionStats.startTime) {
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - executionStats.startTime) / 1000);
        setElapsedSec(Math.max(0, elapsed));
      }, 1000);
    } else {
      setElapsedSec(Math.round(executionStats.totalExecutionTime || 0));
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isExecuting, executionStats.startTime, executionStats.totalExecutionTime]);

  const formatSeconds = (sec) => {
    if (!sec || sec < 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatTimeStr = (timestamp) => {
    if (!timestamp) return 'Not Started';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const runningSecs = isExecuting ? elapsedSec : Math.round(executionStats.totalExecutionTime || 0);

  // Fastest & Slowest details
  const fastest = executionStats.fastestTestDetails || (executionStats.fastestTest > 0 ? { name: 'Suite Test Class', time: executionStats.fastestTest } : null);
  const slowest = executionStats.slowestTestDetails || (executionStats.slowestTest > 0 ? { name: 'Suite Test Class', time: executionStats.slowestTest } : null);

  return (
    <div className="bg-white rounded-custom border border-custom-border p-5 shadow-xs flex flex-col space-y-4 select-none">
      {/* Card Title Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-custom bg-brand/10 border border-brand/20 text-brand">
            <Timer className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
              ⏱ Execution Summary
            </h3>
            <p className="text-[11px] text-text-secondary font-sans">Precision execution timing metrics</p>
          </div>
        </div>

        {isExecuting ? (
          <span className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
            Live Running
          </span>
        ) : executionStats.startTime ? (
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono font-bold flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-custom-border text-slate-500 text-xs font-mono font-semibold">
            Ready
          </span>
        )}
      </div>

      {/* Grid of 4 Compact Fields */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Field 1: Started At */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Clock className="h-3.5 w-3.5 text-brand shrink-0" /> Started At
          </div>
          <p className="font-mono font-extrabold text-text-primary text-sm">
            {formatTimeStr(executionStats.startTime)}
          </p>
          <span className="text-[10px] text-text-secondary block font-mono">
            {executionStats.startTime ? 'Execution Start' : 'Awaiting Run'}
          </span>
        </div>

        {/* Field 2: Total Execution Time */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Timer className="h-3.5 w-3.5 text-indigo-500 shrink-0" /> Total Execution Time
          </div>
          <p className="font-mono font-extrabold text-indigo-600 text-sm">
            {formatSeconds(runningSecs)}
          </p>
          <span className="text-[10px] text-text-secondary block font-mono">
            {isExecuting ? 'Updating live...' : 'Final Duration'}
          </span>
        </div>

        {/* Field 3: Fastest Test */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Zap className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Fastest Test
          </div>
          {fastest ? (
            <div>
              <p className="font-mono font-extrabold text-emerald-600 text-xs truncate" title={fastest.name}>
                {fastest.name}
              </p>
              <span className="text-[10px] font-mono text-emerald-700 font-bold block mt-0.5">
                {typeof fastest.time === 'number' ? `${fastest.time.toFixed(1)}s` : fastest.time}
              </span>
            </div>
          ) : (
            <p className="font-mono text-slate-400 italic text-xs">None</p>
          )}
        </div>

        {/* Field 4: Slowest Test */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Flame className="h-3.5 w-3.5 text-rose-500 shrink-0" /> Slowest Test
          </div>
          {slowest ? (
            <div>
              <p className="font-mono font-extrabold text-rose-600 text-xs truncate" title={slowest.name}>
                {slowest.name}
              </p>
              <span className="text-[10px] font-mono text-rose-700 font-bold block mt-0.5">
                {typeof slowest.time === 'number' ? `${slowest.time.toFixed(1)}s` : slowest.time}
              </span>
            </div>
          ) : (
            <p className="font-mono text-slate-400 italic text-xs">None</p>
          )}
        </div>
      </div>
    </div>
  );
}
