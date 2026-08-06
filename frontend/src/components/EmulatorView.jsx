import React, { useEffect, useState, useRef } from 'react';
import {
  Smartphone,
  RefreshCw,
  Tv,
  Eye,
  MousePointer,
  ArrowLeft,
  Home,
  Layers,
  Power,
  Volume2,
  VolumeX,
  RotateCw,
  Camera,
  Video,
  Type,
  Lock,
  Unlock,
  AlertTriangle,
  ShieldCheck,
  Send,
  X,
  MonitorPlay,
  Settings
} from 'lucide-react';
import TelemetryBar from './TelemetryBar.jsx';
import { useProject } from '../context/ProjectContext.jsx';

export default function EmulatorView() {
  const { operatingMode, setOperatingMode, isExecuting, selectedDevice, startEmulator, fetchDevicesList } = useProject();

  const [frameSrc, setFrameSrc] = useState(null);
  const [connected, setConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [fps, setFps] = useState(0);

  // Quick Action States
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [rotationDegree, setRotationDegree] = useState(0);
  const [lastActionStatus, setLastActionStatus] = useState('');
  const [selectedResolution, setSelectedResolution] = useState('1080x2400');

  const wsRef = useRef(null);
  const frameCountRef = useRef(0);
  const screenRef = useRef(null);

  // Gesture Tracking Refs
  const pointerDownTimeRef = useRef(0);
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const longPressTimerRef = useRef(null);
  const isDraggingRef = useRef(false);

  const connectWebSocket = () => {
    setErrorMsg(null);
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const deviceQuery = selectedDevice?.id ? `?device_id=${encodeURIComponent(selectedDevice.id)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws/emulator${deviceQuery}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setErrorMsg(null);
      };

      ws.onmessage = (event) => {
        const text = event.data;
        if (text.startsWith('ERR:')) {
          setErrorMsg(text.replace('ERR:', '').trim());
          setConnected(false);
          return;
        }

        if (text.startsWith('data:image/')) {
          setFrameSrc(text);
          setConnected(true);
          setErrorMsg(null);
          frameCountRef.current += 1;
        }
      };

      ws.onerror = () => {
        setConnected(false);
        setErrorMsg('Failed to connect to ADB emulator stream');
      };

      ws.onclose = () => {
        setConnected(false);
      };
    } catch (e) {
      setErrorMsg(`Connection error: ${e.message}`);
    }
  };

  // FPS ticker & Re-connect when selected device changes
  useEffect(() => {
    connectWebSocket();

    const fpsInterval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      clearInterval(fpsInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedDevice?.id]);

  // Helper to send backend ADB control API requests
  const sendControlAction = async (action, params = {}) => {
    if (isExecuting) {
      setLastActionStatus('Blocked: Appium Test Running');
      return;
    }

    try {
      setLastActionStatus(`Executing ${action}...`);
      const res = await fetch('/api/device/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, device_id: selectedDevice?.id, params }),
      });
      if (res.ok) {
        setLastActionStatus(`Action '${action}' OK`);
        setTimeout(() => setLastActionStatus(''), 2000);
      } else {
        const data = await res.json();
        setLastActionStatus(`Err: ${data.detail || 'Failed'}`);
      }
    } catch (err) {
      setLastActionStatus(`Err: ${err.message}`);
    }
  };

  const imgRef = useRef(null);

  // Compute normalized coordinates (0.0 to 1.0) on the screen image element
  const getNormalizedCoords = (e) => {
    const targetElement = imgRef.current || screenRef.current;
    if (!targetElement) return { normX: 0.5, normY: 0.5 };

    const rect = targetElement.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    return {
      normX: rect.width > 0 ? x / rect.width : 0.5,
      normY: rect.height > 0 ? y / rect.height : 0.5,
    };
  };

  // Interactive Gesture Handlers
  const handlePointerDown = (e) => {
    if (operatingMode !== 'interactive' || isExecuting) return;
    pointerDownTimeRef.current = Date.now();
    const coords = getNormalizedCoords(e);
    pointerDownPosRef.current = coords;
    isDraggingRef.current = false;

    // Start long-press timer (1000ms)
    longPressTimerRef.current = setTimeout(() => {
      sendControlAction('long_press', { norm_x: coords.normX, norm_y: coords.normY, duration_ms: 1000 });
      longPressTimerRef.current = null;
    }, 900);
  };

  const handlePointerMove = (e) => {
    if (operatingMode !== 'interactive' || isExecuting || !pointerDownTimeRef.current) return;
    const coords = getNormalizedCoords(e);
    const dist = Math.hypot(coords.normX - pointerDownPosRef.current.normX, coords.normY - pointerDownPosRef.current.normY);
    if (dist > 0.03) {
      isDraggingRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handlePointerUp = (e) => {
    if (operatingMode !== 'interactive' || isExecuting) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const duration = Date.now() - pointerDownTimeRef.current;
    const endCoords = getNormalizedCoords(e);
    const startCoords = pointerDownPosRef.current;

    pointerDownTimeRef.current = 0;

    if (isDraggingRef.current) {
      // Execute Swipe / Drag
      sendControlAction('swipe', {
        norm_x1: startCoords.normX,
        norm_y1: startCoords.normY,
        norm_x2: endCoords.normX,
        norm_y2: endCoords.normY,
        duration_ms: Math.max(250, duration),
      });
      isDraggingRef.current = false;
    } else if (duration < 350) {
      // Single Tap
      sendControlAction('tap', { norm_x: endCoords.normX, norm_y: endCoords.normY });
    }
  };

  const handleDoubleClick = (e) => {
    if (operatingMode !== 'interactive' || isExecuting) return;
    const coords = getNormalizedCoords(e);
    sendControlAction('double_tap', { norm_x: coords.normX, norm_y: coords.normY });
  };

  const handleWheelScroll = (e) => {
    if (operatingMode !== 'interactive' || isExecuting) return;
    e.preventDefault();
    const direction = e.deltaY > 0 ? 'down' : 'up';
    sendControlAction('scroll', { direction });
  };

  // Keyboard Text Submit
  const handleSendText = (e) => {
    e.preventDefault();
    if (!inputText) return;
    sendControlAction('text', { text: inputText });
    setInputText('');
    setShowTextInput(false);
  };

  // Rotation Toggle
  const handleRotateToggle = () => {
    const nextRot = (rotationDegree + 1) % 4;
    setRotationDegree(nextRot);
    sendControlAction('rotate', { rotation: nextRot });
  };

  // Screenshot Capture & Download
  const handleTakeScreenshot = async () => {
    if (frameSrc) {
      const a = document.createElement('a');
      a.href = frameSrc;
      a.download = `device_screenshot_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setLastActionStatus('Screenshot Saved');
      setTimeout(() => setLastActionStatus(''), 2000);
    }
  };

  return (
    <div className="bg-white rounded-custom border border-custom-border p-5 shadow-xs flex flex-col items-center justify-between space-y-4 select-none relative">
      {/* Header Bar */}
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-custom bg-brand/10 border border-brand/20 text-brand">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              Android ADB Emulator Stream
            </h3>
            <p className="text-[11px] text-text-secondary">Live 25-30 FPS screen mirror & 2-way remote control</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode vs Interactive Control Mode Toggle */}
          <div className="flex items-center p-0.5 rounded-custom bg-slate-100 border border-custom-border text-xs font-semibold">
            <button
              onClick={() => setOperatingMode('view')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                operatingMode === 'view' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Eye className="h-3.5 w-3.5" /> View
            </button>
            <button
              onClick={() => {
                if (isExecuting) {
                  alert('Automation test is running. Interactive Remote Control is disabled for test safety.');
                } else {
                  setOperatingMode('interactive');
                }
              }}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                operatingMode === 'interactive'
                  ? 'bg-brand text-white shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <MousePointer className="h-3.5 w-3.5" /> Control
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-custom-border text-[11px] font-mono font-bold">
            {connected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                <span className="text-success">{fps} FPS</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-failed"></span>
                <span className="text-failed">Offline</span>
              </>
            )}
          </div>

          <button
            id="btn-reconnect-emulator"
            onClick={connectWebSocket}
            className="p-1.5 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary hover:text-text-primary transition cursor-pointer"
            title="Reconnect ADB Stream"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Safety & Action Status Toast */}
      {isExecuting && (
        <div className="w-full bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-custom text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 animate-bounce" />
            Appium Test Executing — Remote Control Locked for Test Safety
          </span>
          <span className="text-[10px] font-mono uppercase bg-amber-200/80 px-2 py-0.5 rounded">View Only</span>
        </div>
      )}

      {lastActionStatus && !isExecuting && (
        <div className="w-full bg-slate-900 text-emerald-400 font-mono text-[11px] px-3 py-1 rounded-custom flex items-center justify-between">
          <span>[ADB CONTROL] {lastActionStatus}</span>
        </div>
      )}

      {/* Emulator Controls Bar (Visible only when an Android Emulator is selected) */}
      {selectedDevice?.type === 'emulator' && (
        <div className="w-full bg-slate-900 text-slate-100 p-3.5 rounded-custom border border-slate-800 space-y-2.5 text-xs select-none">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-sky-400 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <MonitorPlay className="h-3.5 w-3.5" /> Emulator Controls ({selectedDevice?.name || 'AVD'})
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              selectedDevice?.status === 'running'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {selectedDevice?.status === 'running' ? 'Running' : 'OFF'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedDevice?.status === 'off' ? (
              <button
                onClick={() => startEmulator(selectedDevice?.avd_name)}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <Power className="h-3 w-3" /> Start
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (selectedDevice?.id) {
                    await fetch('/api/emulator/stop', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ device_id: selectedDevice.id }),
                    });
                    await fetchDevicesList();
                  }
                }}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <Power className="h-3 w-3" /> Stop
              </button>
            )}

            <button
              onClick={() => sendControlAction('rotate', { rotation: (rotationDegree + 1) % 4 })}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className="h-3 w-3" /> Rotate
            </button>

            <button
              onClick={handleTakeScreenshot}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Camera className="h-3 w-3 text-emerald-400" /> Screenshot
            </button>

            <button
              onClick={() => fetch('/api/emulator/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'open_settings', device_id: selectedDevice?.id })
              })}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Settings className="h-3 w-3 text-indigo-400" /> Settings
            </button>

            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] text-slate-400 font-bold">Resolution:</span>
              <select
                value={selectedResolution}
                onChange={async (e) => {
                  const val = e.target.value;
                  setSelectedResolution(val);
                  await fetch('/api/emulator/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'resolution', device_id: selectedDevice?.id, params: { resolution: val } })
                  });
                }}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded-md px-2 py-1 text-[10px] font-mono font-bold focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
              >
                <option value="1080x2400">1080×2400 (FHD+)</option>
                <option value="1440x3120">1440×3120 (QHD+)</option>
                <option value="720x1600">720×1600 (HD+)</option>
                <option value="1800x2200">Tablet (1800×2200)</option>
                <option value="2160x1916">Fold (2160×1916)</option>
                <option value="2400x1080">Landscape (2400×1080)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Bar Controls */}
      <TelemetryBar />

      {/* Phone Bezel Container */}
      <div className="relative w-[300px] h-[580px] bg-slate-900 rounded-[44px] p-3 shadow-2xl border-4 border-slate-700/80 ring-1 ring-slate-800/80 flex flex-col justify-between items-center group">
        {/* Physical Side Hardware Buttons */}
        <button
          onClick={() => sendControlAction('keyevent', { keycode: 'VOLUME_UP' })}
          className="absolute -left-2 top-24 w-1.5 h-10 bg-slate-700 hover:bg-indigo-500 rounded-l-md cursor-pointer transition"
          title="Volume Up"
        />
        <button
          onClick={() => sendControlAction('keyevent', { keycode: 'VOLUME_DOWN' })}
          className="absolute -left-2 top-36 w-1.5 h-10 bg-slate-700 hover:bg-indigo-500 rounded-l-md cursor-pointer transition"
          title="Volume Down"
        />
        <button
          onClick={() => sendControlAction('keyevent', { keycode: 'POWER' })}
          className="absolute -right-2 top-28 w-1.5 h-14 bg-slate-700 hover:bg-rose-500 rounded-r-md cursor-pointer transition"
          title="Power Button"
        />

        {/* Top Speaker / Camera Notch */}
        <div className="w-28 h-4 bg-slate-950 rounded-full z-20 flex items-center justify-center gap-2 mb-1 shadow-inner">
          <div className="w-2 h-2 rounded-full bg-slate-800"></div>
          <div className="w-8 h-1 rounded-full bg-slate-800"></div>
        </div>

        {/* Interactive Screen Display Area */}
        <div
          ref={screenRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheelScroll}
          className={`w-full flex-1 bg-slate-950 rounded-[32px] overflow-hidden relative border border-slate-800/60 flex items-center justify-center ${
            operatingMode === 'interactive' && !isExecuting ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {frameSrc && connected ? (
            <img
              ref={imgRef}
              id="emulator-screen-img"
              src={frameSrc}
              alt="Android ADB Live Screen Stream"
              className="w-full h-full object-contain pointer-events-none"
            />
          ) : (
            <div className="p-6 text-center space-y-4 max-w-xs">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <Tv className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-300">ADB Emulator Stream Disconnected</p>
                <p className="text-[10px] text-slate-500 leading-normal">
                  {errorMsg || "Connect a physical Android device via USB or start Android Emulator with ADB enabled."}
                </p>
              </div>
              <button
                id="btn-retry-adb"
                onClick={connectWebSocket}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reconnect ADB
              </button>
            </div>
          )}

          {/* Interactive Overlay Badge */}
          {operatingMode === 'interactive' && !isExecuting && connected && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-brand/80 backdrop-blur-md text-white text-[9px] font-mono font-bold pointer-events-none shadow-md">
              TOUCH CONTROL ACTIVE
            </div>
          )}
        </div>

        {/* Remote Action Navigation Bar */}
        <div className="w-full px-2 py-1.5 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 rounded-b-[32px] flex items-center justify-around text-slate-400 z-10">
          <button
            onClick={() => sendControlAction('keyevent', { keycode: 'BACK' })}
            className="p-1 hover:text-white hover:bg-slate-800 rounded-md transition cursor-pointer"
            title="Back (Key 4)"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => sendControlAction('keyevent', { keycode: 'HOME' })}
            className="p-1 hover:text-white hover:bg-slate-800 rounded-md transition cursor-pointer"
            title="Home (Key 3)"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={() => sendControlAction('keyevent', { keycode: 'RECENTS' })}
            className="p-1 hover:text-white hover:bg-slate-800 rounded-md transition cursor-pointer"
            title="Recent Apps (Key 187)"
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className="p-1 hover:text-indigo-400 hover:bg-slate-800 rounded-md transition cursor-pointer"
            title="Type Text on Device"
          >
            <Type className="h-4 w-4" />
          </button>
          <button
            onClick={handleRotateToggle}
            className="p-1 hover:text-indigo-400 hover:bg-slate-800 rounded-md transition cursor-pointer"
            title="Rotate Screen"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            onClick={handleTakeScreenshot}
            className="p-1 hover:text-emerald-400 hover:bg-slate-800 rounded-md transition cursor-pointer"
            title="Download Screenshot"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        {/* Home Indicator Bar */}
        <div className="w-32 h-1 bg-slate-700 rounded-full mt-1"></div>
      </div>

      {/* Keyboard Text Input Floating Modal */}
      {showTextInput && (
        <form onSubmit={handleSendText} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-custom flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type text to send to phone..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-custom px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand font-mono"
            autoFocus
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-custom text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Send className="h-3 w-3" /> Send
          </button>
          <button
            type="button"
            onClick={() => setShowTextInput(false)}
            className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
