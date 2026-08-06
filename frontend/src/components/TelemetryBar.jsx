import React, { useState, useEffect } from 'react';
import { Wifi, Activity, FlaskConical, Gauge, Check, RefreshCw } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function TelemetryBar() {
  const { activeProject, selectedTest, selectedDevice } = useProject();

  const [networkSpeed, setNetworkSpeed] = useState('Unlimited');
  const [throttling, setThrottling] = useState(false);
  const [throttleMessage, setThrottleMessage] = useState(null);
  const [progress, setProgress] = useState(0);

  const isRealDevice = selectedDevice?.type === 'real';

  // Reset progress bar whenever selectedTest changes
  useEffect(() => {
    setProgress(0);

    if (selectedTest) {
      // Simulate progress progression for active test
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 400);

      return () => clearInterval(interval);
    }
  }, [selectedTest]);

  const handleSpeedChange = async (e) => {
    const val = e.target.value;
    setNetworkSpeed(val);
    setThrottling(true);
    setThrottleMessage(null);

    try {
      const res = await fetch('/api/network/throttle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: val }),
      });

      const data = await res.json();
      if (res.ok) {
        setThrottleMessage(`Throttled: ${val}`);
      } else {
        setThrottleMessage(`Error: ${data.detail || 'Throttle failed'}`);
      }
    } catch (err) {
      setThrottleMessage(`Throttle request error`);
    } finally {
      setThrottling(false);
      setTimeout(() => setThrottleMessage(null), 3000);
    }
  };

  return (
    <div className="w-full bg-slate-50 p-4 rounded-custom border border-custom-border space-y-3 mb-4 select-none">
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Network Speed Throttle Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold text-text-primary">
            <Gauge className="h-4 w-4 text-brand" /> Network Profile:
          </div>
          <select
            id="network-speed-select"
            value={networkSpeed}
            onChange={handleSpeedChange}
            disabled={throttling || isRealDevice}
            title={isRealDevice ? 'Network profile simulation applies only to Android Emulators' : 'Select network profile'}
            className="bg-white border border-custom-border text-text-primary rounded-custom px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-brand transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="Unlimited">Unlimited (Full)</option>
            <option value="WiFi">WiFi</option>
            <option value="2G">2G (GSM)</option>
            <option value="3G">3G (UMTS)</option>
            <option value="4G">4G (LTE)</option>
            <option value="5G">5G (NR)</option>
            <option value="Offline">Offline</option>
            <option value="Custom">Custom Profile</option>
          </select>

          {isRealDevice && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 border border-slate-300">
              Disabled for Real Device
            </span>
          )}

          {throttleMessage && !isRealDevice && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-brand/30 bg-brand/10 text-brand transition">
              {throttleMessage}
            </span>
          )}
        </div>

        {/* Active Test Indicator */}
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand shrink-0" />
          <span className="font-bold text-text-secondary">Active Test:</span>
          <span className={`px-2.5 py-1 rounded-custom text-xs font-mono font-bold truncate max-w-xs border ${
            selectedTest
              ? 'bg-brand/10 text-brand border-brand/20'
              : 'bg-white text-slate-400 border-custom-border'
          }`}>
            {selectedTest ? selectedTest.split('/').pop() : 'None Selected'}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-text-secondary">
          <span>Test Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden p-0.5 border border-custom-border">
          <div
            className="bg-brand h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
