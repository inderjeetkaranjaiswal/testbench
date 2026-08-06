import React, { useState } from 'react';
import {
  Smartphone,
  BatteryCharging,
  Wifi,
  Cpu,
  Activity,
  HardDrive,
  ShieldCheck,
  Zap,
  Radio,
  Layers,
  RefreshCw,
  Monitor,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function DeviceInfoPanel() {
  const { deviceInfo, fetchDeviceInfo } = useProject();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'battery' | 'network' | 'runtime'
  const [collapsed, setCollapsed] = useState(false);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchDeviceInfo();
    setTimeout(() => setRefreshing(false), 500);
  };

  const dev = deviceInfo?.device_details || {};
  const bat = deviceInfo?.battery_info || {};
  const conn = deviceInfo?.connection_info || {};
  const net = deviceInfo?.network_info || {};
  const run = deviceInfo?.runtime_status || {};
  const isOnline = deviceInfo?.status === 'online';

  return (
    <div className="bg-white rounded-custom border border-custom-border p-5 shadow-xs flex flex-col space-y-4 select-none">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-custom bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary">Advanced Device Information</h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                  isOnline
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                {isOnline ? 'ADB CONNECTED' : 'OFFLINE'}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary font-mono truncate max-w-sm">
              {isOnline ? `${dev.device_name} (${conn.connection_type})` : 'No Android device detected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-refresh-device-info"
            onClick={handleManualRefresh}
            className="p-1.5 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary hover:text-text-primary transition cursor-pointer"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-brand' : ''}`} />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary transition cursor-pointer"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Category Tabs */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-custom text-xs font-semibold">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-1.5 rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'overview' ? 'bg-white text-brand shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" /> Device Specs
            </button>
            <button
              onClick={() => setActiveTab('battery')}
              className={`flex-1 py-1.5 rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'battery' ? 'bg-white text-brand shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BatteryCharging className="h-3.5 w-3.5" /> Battery & Power
            </button>
            <button
              onClick={() => setActiveTab('network')}
              className={`flex-1 py-1.5 rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'network' ? 'bg-white text-brand shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wifi className="h-3.5 w-3.5" /> Connection & Net
            </button>
            <button
              onClick={() => setActiveTab('runtime')}
              className={`flex-1 py-1.5 rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'runtime' ? 'bg-white text-brand shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="h-3.5 w-3.5" /> Runtime Status
            </button>
          </div>

          {/* Tab 1: Device Specs */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Manufacturer</span>
                <p className="font-bold text-text-primary truncate">{dev.manufacturer || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Model / AVD Name</span>
                <p className="font-bold text-text-primary truncate">{dev.avd_name || dev.model || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Android Version</span>
                <p className="font-bold text-brand font-mono truncate">{dev.android_version || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">SDK API</span>
                <p className="font-bold text-text-primary font-mono truncate">{dev.sdk_version || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">RAM Memory</span>
                <p className="font-mono text-[11px] font-bold text-indigo-600 truncate">{dev.ram || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Internal Storage</span>
                <p className="font-mono text-[11px] font-bold text-emerald-600 truncate">{dev.storage || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Uptime</span>
                <p className="font-mono text-[11px] text-text-primary truncate">{dev.uptime || 'Just now'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Build Number</span>
                <p className="font-mono text-[11px] text-text-primary truncate">{dev.build_number || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Serial Number</span>
                <p className="font-mono text-[11px] text-text-primary truncate">{dev.serial_number || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">CPU Architecture</span>
                <p className="font-mono text-text-primary truncate">{dev.cpu_architecture || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Screen Resolution</span>
                <p className="font-mono text-text-primary truncate">{dev.screen_resolution} ({dev.dpi})</p>
              </div>
            </div>
          )}

          {/* Tab 2: Battery & Power */}
          {activeTab === 'battery' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-custom bg-emerald-50/60 border border-emerald-200/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase">Battery Level</span>
                  <Zap className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-xl font-black font-mono text-emerald-700">{bat.percentage || 'Unavailable'}</p>
              </div>
              <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Charging Status</span>
                <p className="font-bold text-text-primary">{bat.charging_status || 'Unavailable'}</p>
              </div>
              <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Charging Type</span>
                <p className="font-bold text-text-primary">{bat.charging_type || 'Unavailable'}</p>
              </div>
              <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Battery Health</span>
                <p className="font-bold text-emerald-600">{bat.battery_health || 'Good'}</p>
              </div>
              <div className="p-3.5 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Temperature</span>
                <p className="font-mono font-bold text-text-primary">{bat.battery_temperature || 'Unavailable'}</p>
              </div>
            </div>
          )}

          {/* Tab 3: Connection & Network */}
          {activeTab === 'network' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-custom bg-indigo-50/60 border border-indigo-200/80 space-y-1">
                <span className="text-[10px] font-bold text-indigo-800 uppercase">Connection Mode</span>
                <p className="font-bold text-indigo-700 truncate">{conn.connection_type || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">IP Address</span>
                <p className="font-mono font-bold text-text-primary truncate">{conn.ip_address || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Port</span>
                <p className="font-mono text-text-primary truncate">{conn.port || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Wi-Fi SSID</span>
                <p className="font-bold text-text-primary truncate">{net.ssid || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Signal Strength</span>
                <p className="font-mono text-text-primary truncate">{net.signal_strength || 'Unavailable'}</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Upload Speed</span>
                <p className="font-mono text-slate-400 italic">Unavailable</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Download Speed</span>
                <p className="font-mono text-slate-400 italic">Unavailable</p>
              </div>
              <div className="p-3 rounded-custom bg-slate-50 border border-custom-border space-y-1">
                <span className="text-[10px] font-bold text-text-secondary uppercase">Connection Quality</span>
                <p className="font-bold text-emerald-600 truncate">{net.connection_quality || 'Good'}</p>
              </div>
            </div>
          )}

          {/* Tab 4: Live Runtime Status */}
          {activeTab === 'runtime' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-custom border border-custom-border bg-slate-50 flex items-center justify-between">
                  <span className="font-semibold text-text-secondary">ADB Bridge</span>
                  {run.adb_connected ? (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Online
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" /> Offline
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-custom border border-custom-border bg-slate-50 flex items-center justify-between">
                  <span className="font-semibold text-text-secondary">Appium Server</span>
                  {run.appium_connected ? (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Port 4723
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Auto-Launch
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-custom border border-custom-border bg-slate-50 flex items-center justify-between">
                  <span className="font-semibold text-text-secondary">Screen Display</span>
                  <span className="text-[11px] font-bold text-indigo-600">
                    {run.screen_on ? 'Screen ON' : 'Screen OFF'}
                  </span>
                </div>

                <div className="p-2.5 rounded-custom border border-custom-border bg-slate-50 flex items-center justify-between">
                  <span className="font-semibold text-text-secondary">Keyguard Lock</span>
                  {run.is_locked ? (
                    <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                      <Lock className="h-3.5 w-3.5" /> Locked
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <Unlock className="h-3.5 w-3.5" /> Unlocked
                    </span>
                  )}
                </div>
              </div>

              {/* Foreground Package & Activity */}
              <div className="p-3 rounded-custom bg-slate-900 text-slate-100 font-mono space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Current Foreground Application
                </span>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                  <span className="text-emerald-400 font-bold truncate">
                    Package: {run.foreground_package || 'Unavailable'}
                  </span>
                  <span className="text-indigo-300 truncate">
                    Activity: {run.foreground_activity || 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
