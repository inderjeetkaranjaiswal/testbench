import React, { useState } from 'react';
import { Smartphone, MonitorPlay, Play, RefreshCw, CheckCircle2, AlertCircle, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function DeviceSelector() {
  const {
    devicesList,
    selectedDevice,
    setSelectedDevice,
    fetchDevicesList,
    startEmulator,
    startingEmulator,
    loadingDevices,
  } = useProject();

  const [statusMsg, setStatusMsg] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const realDevices = devicesList?.real_devices || [];
  const emulators = devicesList?.emulators || [];

  const handleStartEmulator = async (e, avdName) => {
    e.stopPropagation();
    setStatusMsg(`Booting emulator '${avdName.replace(/_/g, ' ')}'...`);
    const res = await startEmulator(avdName);
    if (res.success) {
      setStatusMsg(`Emulator '${avdName.replace(/_/g, ' ')}' is now online!`);
    } else {
      setStatusMsg(`Error: ${res.message}`);
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const getDeviceDisplayName = (device) => {
    if (!device) return 'No Device Selected';
    if (device.type === 'real') {
      return device.name || device.model || `Physical Device (${device.id})`;
    }
    return device.name || device.avd_name?.replace(/_/g, ' ') || 'Android Emulator';
  };

  return (
    <div className="bg-white p-4 rounded-custom border border-custom-border shadow-xs space-y-3 select-none">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-custom bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Target Execution Device</span>
            <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-2 font-mono">
              {getDeviceDisplayName(selectedDevice)}
              {selectedDevice?.type === 'emulator' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-50 text-sky-700 border border-sky-200 font-sans">
                  Android Emulator
                </span>
              ) : selectedDevice?.type === 'real' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-sans">
                  Real Device
                </span>
              ) : null}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-refresh-devices"
            onClick={fetchDevicesList}
            className="p-1.5 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary hover:text-text-primary transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Refresh ADB & AVD Device List"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDevices ? 'animate-spin text-brand' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-3 py-1.5 rounded-custom border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            Switch Device <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Feedback Toast */}
      {statusMsg && (
        <div className="p-2.5 rounded-custom bg-slate-900 text-emerald-400 font-mono text-xs flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-400 animate-pulse" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Categories & Selector Drawer / Panel */}
      {isOpen && (
        <div className="pt-2 space-y-4">
          {/* CATEGORY 1: PHYSICAL DEVICES */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-emerald-600" /> Physical Devices ({realDevices.length})
            </span>

            {realDevices.length === 0 ? (
              <div className="p-3 rounded-custom bg-slate-50 border border-dashed border-custom-border text-[11px] text-text-secondary italic">
                No physical devices connected via USB/Wi-Fi ADB.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {realDevices.map((dev) => {
                  const isSelected = selectedDevice?.id === dev.id;
                  return (
                    <div
                      key={dev.id}
                      onClick={() => {
                        setSelectedDevice(dev);
                        setIsOpen(false);
                      }}
                      className={`p-3 rounded-custom border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-400 text-emerald-950 font-bold'
                          : 'bg-slate-50 hover:bg-slate-100/80 border-custom-border text-text-primary'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold truncate">{dev.name}</p>
                        <p className="text-[10px] font-mono text-text-secondary truncate">Serial: {dev.id}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Connected
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CATEGORY 2: ANDROID STUDIO EMULATORS */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <MonitorPlay className="h-3.5 w-3.5 text-sky-600" /> Android Studio Emulators ({emulators.length})
            </span>

            {emulators.length === 0 ? (
              <div className="p-4 rounded-custom bg-slate-50 border border-dashed border-custom-border text-center space-y-2">
                <AlertCircle className="h-5 w-5 text-amber-500 mx-auto" />
                <p className="text-xs font-bold text-text-primary">No Android Studio emulators found.</p>
                <p className="text-[11px] text-text-secondary">Please create an AVD image in Android Studio Device Manager.</p>
                <button
                  onClick={async () => {
                    try {
                      await fetch('/api/emulator/open-studio', { method: 'POST' });
                      setStatusMsg('Opening Android Studio...');
                      setTimeout(() => setStatusMsg(null), 3000);
                    } catch (e) {
                      alert('Please launch Android Studio manually.');
                    }
                  }}
                  className="px-3 py-1.5 rounded-custom bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Open Android Studio Device Manager
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {emulators.map((emu, idx) => {
                  const isRunning = emu.status === 'running';
                  const isSelected = (emu.id && selectedDevice?.id === emu.id) || (selectedDevice?.avd_name === emu.avd_name);
                  const isStartingThis = startingEmulator === emu.avd_name;

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (isRunning) {
                          setSelectedDevice(emu);
                          setIsOpen(false);
                        }
                      }}
                      className={`p-3 rounded-custom border transition-all flex items-center justify-between ${
                        isRunning ? 'cursor-pointer' : 'cursor-default'
                      } ${
                        isSelected
                          ? 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-400 text-sky-950 font-bold'
                          : 'bg-slate-50 hover:bg-slate-100/80 border-custom-border text-text-primary'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold truncate">{emu.name}</p>
                        <p className="text-[10px] font-mono text-text-secondary truncate">
                          {isRunning ? `ID: ${emu.id}` : `AVD: ${emu.avd_name}`}
                        </p>
                      </div>

                      {isRunning ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Running
                          </span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (emu.id) {
                                setStatusMsg(`Stopping emulator '${emu.name}'...`);
                                await fetch('/api/emulator/stop', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ device_id: emu.id }),
                                });
                                await fetchDevicesList();
                                setStatusMsg(`Emulator stopped.`);
                                setTimeout(() => setStatusMsg(null), 3000);
                              }
                            }}
                            className="px-2 py-0.5 rounded text-[10px] bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold cursor-pointer"
                          >
                            Stop
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => handleStartEmulator(e, emu.avd_name)}
                          disabled={isStartingThis}
                          className="px-2.5 py-1 rounded-custom bg-brand hover:bg-brand-hover text-white text-[11px] font-bold transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer disabled:opacity-60"
                        >
                          {isStartingThis ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" /> Starting...
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-current" /> Start Emulator
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
