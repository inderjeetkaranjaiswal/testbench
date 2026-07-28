import React, { useState } from 'react';
import ExecutionHistory from '../components/ExecutionHistory.jsx';
import EmulatorView from '../components/EmulatorView.jsx';
import { History, Smartphone } from 'lucide-react';

export default function LogsView() {
  const [showEmulator, setShowEmulator] = useState(true);

  return (
    <div className="p-6 md:p-8 space-y-4 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col bg-slate-50 select-none">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
          <History className="h-5 w-5 text-blue-600" /> Execution Logs & History Console
        </h1>
        <button
          id="btn-toggle-emulator"
          onClick={() => setShowEmulator(!showEmulator)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 border shadow-xs cursor-pointer ${
            showEmulator
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Smartphone className="h-4 w-4" />
          {showEmulator ? 'Hide ADB Emulator Stream' : 'Show ADB Emulator Stream'}
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Execution History View on Left/Center */}
        <div className={`${showEmulator ? 'lg:col-span-8' : 'lg:col-span-12'} h-full min-h-0 transition-all duration-300`}>
          <ExecutionHistory />
        </div>

        {/* ADB Emulator View on Right */}
        {showEmulator && (
          <div className="lg:col-span-4 h-full overflow-y-auto">
            <EmulatorView />
          </div>
        )}
      </div>
    </div>
  );
}
