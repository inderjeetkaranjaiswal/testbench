import React from 'react';
import { Settings as SettingsIcon, Sliders, Shield, Database, Cpu, Info } from 'lucide-react';

export default function Settings() {
  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto bg-slate-50 min-h-screen select-none">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
          <SettingsIcon className="h-6 w-6 text-slate-600" /> Platform Configuration
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage local execution environment preferences, server paths, and watcher limits.
        </p>
      </div>

      <div className="space-y-6">
        {/* Card 1 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-blue-600" /> Workspace Storage Settings
          </h2>
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Target Directory Path</label>
              <input
                type="text"
                readOnly
                value="c:/Users/Bhargav/Documents/callhealth/TestBench1/workspace"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-mono text-slate-800 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <div>
                <p className="font-bold text-slate-900">Watchdog File Monitoring</p>
                <p className="text-slate-500 text-[11px]">Automatically trigger live build events on workspace file modifications.</p>
              </div>
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-blue-600 cursor-pointer" />
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-600" /> FastAPI & Uvicorn Host Config
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Backend Server Host</label>
              <input type="text" readOnly value="127.0.0.1" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-mono text-slate-800" />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Backend Server Port</label>
              <input type="text" readOnly value="8000" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-mono text-slate-800" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
