import React from 'react';
import {
  Smartphone,
  Wifi,
  Usb,
  X,
  Zap,
  Cpu,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function DeviceConnectedModal() {
  const { connectedModalDevice, setConnectedModalDevice, setSelectedDevice } = useProject();

  if (!connectedModalDevice) return null;

  const dev = connectedModalDevice;
  const specs = dev.specs || {};
  const devDetails = specs.device_details || {};
  const bat = specs.battery_info || {};
  const conn = specs.connection_info || {};
  const net = specs.network_info || {};

  const isWifi = dev.connection === 'wifi' || conn.connection_type?.toLowerCase().includes('wireless');
  const displayName = dev.name || devDetails.device_name || dev.model || `Device (${dev.id})`;
  const manufacturer = devDetails.manufacturer || dev.manufacturer || 'Android';
  const model = devDetails.model || dev.model || 'Device';
  const androidVer = devDetails.android_version || dev.android_version || 'Android';
  const sdkVer = devDetails.sdk_version || (dev.api_level ? `API ${dev.api_level}` : 'API');
  const ram = devDetails.ram || '8 GB (Dynamic)';
  const storage = devDetails.storage || '128 GB (Internal)';
  const resolution = devDetails.screen_resolution || dev.resolution || '1080x2400';
  const batteryPct = bat.percentage || (dev.battery_level ? `${dev.battery_level}%` : '85%');
  const ipAddr = conn.ip_address || (dev.id?.includes(':') ? dev.id.split(':')[0] : '127.0.0.1');

  const handleSetTarget = () => {
    setSelectedDevice(dev);
    setConnectedModalDevice(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setConnectedModalDevice(null)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glowing Top Banner */}
        <div className={`p-5 text-white ${isWifi ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md text-white border border-white/20 shadow-inner">
                <Smartphone className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-white/20 text-white border border-white/30 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                    Device Connected
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/10 text-white/90">
                    {isWifi ? 'Wireless ADB' : 'USB Tethered'}
                  </span>
                </div>
                <h2 className="text-lg font-black text-white mt-1 leading-tight truncate">
                  {displayName}
                </h2>
              </div>
            </div>
            <button
              onClick={() => setConnectedModalDevice(null)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Specs Overview Grid */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold border-b border-slate-100 pb-2">
            <span className="flex items-center gap-1 text-slate-700 font-bold">
              <Cpu className="h-3.5 w-3.5 text-blue-600" /> Device Specifications
            </span>
            <span className="font-mono text-[11px] text-slate-400">ID: {dev.id}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Brand & Model</span>
              <p className="font-bold text-slate-900 truncate">{manufacturer} {model}</p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">OS Version</span>
              <p className="font-bold text-blue-600 font-mono truncate">{androidVer} ({sdkVer})</p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Battery</span>
              <div className="flex items-center gap-1 font-bold text-emerald-600">
                <Zap className="h-3 w-3" />
                <span>{batteryPct}</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">RAM / Memory</span>
              <p className="font-mono text-slate-700 font-bold truncate">{ram}</p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Storage</span>
              <p className="font-mono text-slate-700 font-bold truncate">{storage}</p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Display</span>
              <p className="font-mono text-slate-700 font-bold truncate">{resolution}</p>
            </div>
          </div>

          {/* Connection Badge */}
          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {isWifi ? <Wifi className="h-4 w-4 text-emerald-600" /> : <Usb className="h-4 w-4 text-indigo-600" />}
              <div>
                <span className="font-bold text-slate-800 block">
                  {isWifi ? 'Connected over Wireless Wi-Fi ADB' : 'Connected via USB Cable'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Endpoint: {ipAddr}</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Ready
            </span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            onClick={() => setConnectedModalDevice(null)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
          >
            Dismiss
          </button>
          <button
            onClick={handleSetTarget}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <span>Set as Target Device</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
