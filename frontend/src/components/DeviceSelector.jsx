import React, { useState } from 'react';
import {
  Smartphone,
  MonitorPlay,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ChevronDown,
  Wifi,
  Usb,
  Cpu,
  Filter
} from 'lucide-react';
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
  const [filterType, setFilterType] = useState('all'); // 'all' | 'physical' | 'emulator' | 'available'

  // Extract from unified model or fallback to categorised lists
  const unifiedDevices = devicesList?.devices || [];
  const realDevices = devicesList?.real_devices || unifiedDevices.filter((d) => d.type === 'physical');
  const emulators = devicesList?.emulators || unifiedDevices.filter((d) => d.type === 'emulator');

  const filteredDevices = unifiedDevices.filter((d) => {
    if (filterType === 'physical') return d.type === 'physical';
    if (filterType === 'emulator') return d.type === 'emulator';
    if (filterType === 'available') return d.status === 'available';
    return true;
  });

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
    if (device.type === 'physical' || device.type === 'real') {
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
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-50 text-sky-700 border border-sky-200 font-sans flex items-center gap-1">
                  <MonitorPlay className="h-3 w-3" /> Android Emulator
                </span>
              ) : selectedDevice?.type === 'physical' || selectedDevice?.type === 'real' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-sans flex items-center gap-1">
                  {selectedDevice?.connection === 'wifi' ? <Wifi className="h-3 w-3" /> : <Usb className="h-3 w-3" />}
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

      {/* Unified Device Selector Drawer */}
      {isOpen && (
        <div className="pt-2 space-y-3">
          {/* Quick Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white font-bold'
                  : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
              }`}
            >
              All ({unifiedDevices.length})
            </button>
            <button
              onClick={() => setFilterType('physical')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                filterType === 'physical'
                  ? 'bg-emerald-700 text-white font-bold'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <Smartphone className="h-3 w-3" /> Physical ({realDevices.length})
            </button>
            <button
              onClick={() => setFilterType('emulator')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                filterType === 'emulator'
                  ? 'bg-sky-700 text-white font-bold'
                  : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
              }`}
            >
              <MonitorPlay className="h-3 w-3" /> Emulators ({emulators.length})
            </button>
            <button
              onClick={() => setFilterType('available')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                filterType === 'available'
                  ? 'bg-indigo-700 text-white font-bold'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
              }`}
            >
              <CheckCircle2 className="h-3 w-3" /> Available ({unifiedDevices.filter((d) => d.status === 'available').length})
            </button>
          </div>

          {/* Device Cards Grid */}
          {filteredDevices.length === 0 ? (
            <div className="p-4 rounded-custom bg-slate-50 border border-dashed border-custom-border text-center space-y-2">
              <AlertCircle className="h-5 w-5 text-amber-500 mx-auto" />
              <p className="text-xs font-bold text-text-primary">No devices found matching filter '{filterType}'.</p>
              <p className="text-[11px] text-text-secondary">Connect a physical device via USB/Wi-Fi or boot an emulator.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
              {filteredDevices.map((dev, idx) => {
                const isOnline = dev.status === 'available' || dev.status === 'busy' || dev.status === 'running';
                const isSelected = (dev.id && selectedDevice?.id === dev.id) || (dev.avd_name && selectedDevice?.avd_name === dev.avd_name);
                const isStartingThis = startingEmulator === dev.avd_name;

                return (
                  <div
                    key={dev.id || dev.avd_name || idx}
                    onClick={() => {
                      if (isOnline) {
                        setSelectedDevice(dev);
                        setIsOpen(false);
                      }
                    }}
                    className={`p-3 rounded-custom border transition-all flex items-center justify-between ${
                      isOnline ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isSelected
                        ? dev.type === 'physical'
                          ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400 text-emerald-950 font-bold'
                          : 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-400 text-sky-950 font-bold'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-custom-border text-text-primary'
                    }`}
                  >
                    <div className="min-w-0 pr-2 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold truncate">{dev.name || dev.model}</p>
                        {dev.type === 'physical' ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                            {dev.connection === 'wifi' ? 'Wi-Fi' : 'USB'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-200 uppercase">
                            AVD
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-text-secondary truncate">
                        {dev.id ? `Serial: ${dev.id}` : `AVD: ${dev.avd_name}`}
                      </p>
                    </div>

                    {/* Action / Status Pill */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {dev.status === 'busy' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          Busy
                        </span>
                      ) : isOnline ? (
                        <>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Available
                          </span>
                          {dev.type === 'emulator' && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (dev.id) {
                                  setStatusMsg(`Stopping emulator '${dev.name}'...`);
                                  await fetch('/api/emulator/stop', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ device_id: dev.id }),
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
                          )}
                        </>
                      ) : (
                        <button
                          onClick={(e) => handleStartEmulator(e, dev.avd_name)}
                          disabled={isStartingThis}
                          className="px-2.5 py-1 rounded-custom bg-brand hover:bg-brand-hover text-white text-[11px] font-bold transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer disabled:opacity-60"
                        >
                          {isStartingThis ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" /> Starting...
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-current" /> Start
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
