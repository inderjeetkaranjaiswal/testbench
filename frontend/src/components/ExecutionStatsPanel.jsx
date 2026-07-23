import React, { useEffect, useState } from 'react';
import { Timer, Clock, Play, Zap, Gauge, Flame, CheckCircle, Hourglass, BarChart2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function ExecutionStatsPanel() {
  const { executionStats, isExecuting } = useProject();
  const [liveDuration, setLiveDuration] = useState(0);

  // Live timer tick when execution is running
  useEffect(() => {
    let timer = null;
    if (isExecuting && executionStats.startTime) {
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - executionStats.startTime) / 1000);
        setLiveDuration(Math.max(0, elapsed));
      }, 1000);
    } else {
      setLiveDuration(executionStats.totalExecutionTime || 0);
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

  const formatTimestamp = (ts) => {
    if (!ts) return 'Not Started';
    return new Date(ts).toLocaleTimeString();
  };

  const runningSecs = isExecuting ? liveDuration : (executionStats.totalExecutionTime || 0);

  return (
    <div className="bg-white rounded-custom border border-custom-border p-5 shadow-xs flex flex-col space-y-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-custom bg-emerald-50 border border-emerald-100 text-emerald-600">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              Execution Statistics
            </h3>
            <p className="text-[11px] text-text-secondary">Real-time execution performance metrics</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isExecuting ? (
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              Execution Active
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-custom-border text-slate-500 text-xs font-mono font-semibold">
              Idle
            </span>
          )}
        </div>
      </div>

      {/* Grid of Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
        {/* Start / End Time */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Clock className="h-3.5 w-3.5 text-brand" /> Start / End Time
          </div>
          <p className="font-mono font-bold text-text-primary text-xs truncate">
            {formatTimestamp(executionStats.startTime)}
          </p>
          <p className="font-mono text-[10px] text-text-secondary truncate">
            End: {executionStats.endTime ? formatTimestamp(executionStats.endTime) : (isExecuting ? 'Running...' : 'N/A')}
          </p>
        </div>

        {/* Current / Total Duration */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Timer className="h-3.5 w-3.5 text-indigo-500" /> Duration
          </div>
          <p className="font-mono font-extrabold text-indigo-600 text-base">
            {formatSeconds(runningSecs)}
          </p>
          <span className="text-[10px] text-text-secondary block font-mono">
            {isExecuting ? 'Live Running Time' : 'Total Pipeline Time'}
          </span>
        </div>

        {/* Avg Time per Test */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <BarChart2 className="h-3.5 w-3.5 text-emerald-500" /> Avg Time / Test
          </div>
          <p className="font-mono font-bold text-emerald-600 text-base">
            {executionStats.averageTimePerTest ? `${executionStats.averageTimePerTest.toFixed(1)}s` : '0s'}
          </p>
          <span className="text-[10px] text-text-secondary block">Computed per suite</span>
        </div>

        {/* Fastest / Slowest Test */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Fastest / Slowest
          </div>
          <div className="flex items-center justify-between font-mono font-bold text-xs">
            <span className="text-emerald-600">Fast: {executionStats.fastestTest ? `${executionStats.fastestTest.toFixed(1)}s` : '0s'}</span>
            <span className="text-rose-500">Slow: {executionStats.slowestTest ? `${executionStats.slowestTest.toFixed(1)}s` : '0s'}</span>
          </div>
          <span className="text-[10px] text-text-secondary block">Class execution speed</span>
        </div>

        {/* Remaining Tests & Est. Remaining Time */}
        <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-text-secondary font-bold text-[10px] uppercase">
            <Hourglass className="h-3.5 w-3.5 text-purple-500" /> Remaining
          </div>
          <p className="font-mono font-extrabold text-purple-600 text-base">
            {formatSeconds(executionStats.estimatedRemainingTime)}
          </p>
          <span className="text-[10px] text-text-secondary block font-mono">
            {executionStats.totalTestsRemaining} test(s) left
          </span>
        </div>
      </div>
    </div>
  );
}
