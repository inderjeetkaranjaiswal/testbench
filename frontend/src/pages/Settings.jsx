import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Sliders,
  Cpu,
  RefreshCw,
  CheckCircle2,
  XCircle,
  HardDrive,
  Terminal,
  Shield,
  Copy,
  Check,
  Smartphone,
  Info
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function Settings() {
  const { showToast, fetchDevicesList } = useProject();
  const [diagnostics, setDiagnostics] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [watchdogActive, setWatchdogActive] = useState(true);
  const [copiedDiag, setCopiedDiag] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const [diagRes, healthRes] = await Promise.all([
        fetch('/api/system/diagnostics'),
        fetch('/api/health'),
      ]);

      if (diagRes.ok) {
        const dData = await diagRes.json();
        setDiagnostics(dData);
      }
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setHealth(hData);
      }
      showToast('Diagnostics refreshed', 'info', 2000);
    } catch (err) {
      console.error('Failed to load system diagnostics:', err);
      showToast('Failed to load system diagnostics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const handleCopyDiagnostics = () => {
    if (!diagnostics) return;
    navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    setCopiedDiag(true);
    setTimeout(() => setCopiedDiag(false), 2000);
    showToast('Diagnostics JSON copied to clipboard', 'success');
  };

  const handleRescanDevices = async () => {
    await fetchDevicesList();
    showToast('ADB & AVD devices re-scanned', 'success');
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto bg-slate-50 min-h-screen select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <SettingsIcon className="h-6 w-6 text-slate-600" /> Platform Configuration & Diagnostics
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Execution environment health, tool discovery, and workspace settings.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={handleCopyDiagnostics}
            className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            {copiedDiag ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
            <span>{copiedDiag ? 'Copied' : 'Copy JSON'}</span>
          </button>

          <button
            onClick={fetchDiagnostics}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Run Diagnostics
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Workspace Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-blue-600" /> Workspace Storage
          </h2>
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-900 block">Workspace Directory</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Managed via <code className="text-blue-600 font-bold">TESTBENCH_WORKSPACE</code> environment configuration
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready & Online
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <div>
                <p className="font-bold text-slate-900">Watchdog File Monitoring</p>
                <p className="text-slate-500 text-[11px]">Automatically detects test report XML/HTML files on run completion.</p>
              </div>
              <input
                type="checkbox"
                checked={watchdogActive}
                onChange={(e) => {
                  setWatchdogActive(e.target.checked);
                  showToast(
                    `Watchdog monitoring ${e.target.checked ? 'enabled' : 'paused'}`,
                    e.target.checked ? 'success' : 'info'
                  );
                }}
                className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* System Dependencies Diagnostics Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-indigo-600" /> Environment Dependencies Discovery
            </h2>
            <button
              onClick={handleRescanDevices}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Re-scan Devices
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500">Checking environment dependencies...</div>
          ) : diagnostics?.dependencies ? (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
              {diagnostics.dependencies.map((dep, idx) => (
                <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800">{dep.name}</span>
                    <p className="text-[11px] text-slate-500 font-mono truncate max-w-lg">
                      {dep.available ? (dep.path || 'Available') : (dep.error || 'Not found')}
                    </p>
                  </div>
                  {dep.available ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Detected
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Not Found
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-slate-500">Diagnostics unavailable.</div>
          )}
        </div>

        {/* Host Config Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-600" /> Server Host Info
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Backend Server</span>
              <p className="font-mono font-bold text-slate-800">{health?.backend || 'FastAPI + Uvicorn'}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Server Status</span>
              <p className="font-mono font-bold text-emerald-600">{health?.status || 'Online'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
