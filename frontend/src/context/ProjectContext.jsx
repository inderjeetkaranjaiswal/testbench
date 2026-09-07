import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import ShortcutsModal from '../components/ShortcutsModal.jsx';
import DeviceConnectedModal from '../components/DeviceConnectedModal.jsx';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('tb_auth') === 'true');
  const [activeProject, setActiveProject] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [selectedTests, setSelectedTests] = useState([]);
  const [runTarget, setRunTarget] = useState('all'); // 'all' | 'selected'
  const [projectsList, setProjectsList] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTests, setLoadingTests] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Single Source of Truth Execution Session State
  const [executionSession, setExecutionSession] = useState({
    execution_id: '',
    project_id: '',
    selected_test: '',
    device_id: '',
    current_module: 'Dashboard',
    current_screen: 'Services',
    status: 'IDLE',
    progress: 0,
    start_time: 0,
    last_action: '',
    error_message: ''
  });

  // Global Toasts & Notification Feed
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState(() => [
    {
      id: 'notif-1',
      title: 'Platform Ready',
      message: 'FastAPI Backend & ADB Bridges initialized and online.',
      time: 'Just now',
      type: 'success',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Workspace Active',
      message: 'Workspace directory synchronized with auto-discovery.',
      time: '1m ago',
      type: 'info',
      read: false,
    },
  ]);

  const showToast = (message, type = 'info', duration = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const addNotification = (title, message, type = 'info') => {
    const newNotif = {
      id: `notif-${Date.now()}`,
      title,
      message,
      time: 'Just now',
      type,
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    // Also trigger native desktop notification if window is hidden
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification(`TestBench: ${title}`, {
          body: message,
          icon: '/testbench-logo.png',
        });
      } catch (e) {}
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  // Request browser desktop notification permission
  const requestDesktopNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (e) {}
    }
  };

  // Interactive Mirroring & Execution Telemetry States
  const [operatingMode, setOperatingMode] = useState('view'); // 'view' | 'interactive'
  const [isExecuting, setIsExecuting] = useState(false);
  const wasExecutingRef = useRef(false);
  const executionStartTimeRef = useRef(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [executionStats, setExecutionStats] = useState({
    startTime: null,
    endTime: null,
    currentRunningTime: 0,
    totalExecutionTime: 0,
    averageTimePerTest: 0,
    fastestTest: 0,
    slowestTest: 0,
    fastestTestDetails: null,
    slowestTestDetails: null,
    estimatedRemainingTime: 0,
    totalTestsRemaining: 0,
    completedTests: 0,
    totalTests: 0,
  });

  // Device Selection & Emulator Management States
  const [devicesList, setDevicesList] = useState({ real_devices: [], emulators: [] });
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [startingEmulator, setStartingEmulator] = useState(null);
  const [connectedModalDevice, setConnectedModalDevice] = useState(null);
  // Multi-session tracking
  const [activeSessions, setActiveSessions] = useState([]);

  const fetchExecutionSession = async () => {
    try {
      const devQuery = selectedDevice?.id ? `?device_id=${encodeURIComponent(selectedDevice.id)}` : '';
      const res = await fetch(`/api/execution/session${devQuery}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.execution_id && data.status !== 'IDLE') {
          setExecutionSession(data);
          const isRunningStatus = data.status === 'RUNNING' || data.status === 'STARTING' || data.status === 'QUEUED';
          setIsExecuting(isRunningStatus);

          const startMs = data.start_time ? data.start_time * 1000 : null;

          if (isRunningStatus && startMs) {
            if (!executionStartTimeRef.current) {
              executionStartTimeRef.current = startMs;
            }
            setExecutionStats((prev) => ({
              ...prev,
              startTime: startMs,
              endTime: null,
            }));
          } else if (!isRunningStatus) {
            const durationSec = typeof data.duration === 'number' && data.duration > 0
              ? Math.round(data.duration)
              : 0;

            setExecutionStats((prev) => ({
              ...prev,
              startTime: startMs || prev.startTime,
              endTime: startMs && durationSec ? (startMs + durationSec * 1000) : prev.endTime,
              totalExecutionTime: durationSec > 0 ? durationSec : (prev.totalExecutionTime || 0),
            }));
          }
        } else if (data && data.status === 'IDLE') {
          setIsExecuting(false);
          executionStartTimeRef.current = null;
        }
      }

      const sessionsRes = await fetch('/api/execution/sessions');
      if (sessionsRes.ok) {
        const sData = await sessionsRes.json();
        setActiveSessions(sData.sessions || []);
      }
    } catch (err) {}
  };

  const fetchDevicesList = async () => {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevicesList(data);

        setSelectedDevice((prev) => {
          const isOnline = (d) => Boolean(d && (d.id || d.status === 'running' || d.status === 'available' || d.status === 'busy'));

          if (prev) {
            const foundReal = (data.real_devices || []).find((d) => d.id === prev.id);
            if (foundReal && isOnline(foundReal)) {
              if (prev.id === foundReal.id && prev.status === foundReal.status && prev.type === foundReal.type) {
                return prev;
              }
              return foundReal;
            }
            const foundEmu = (data.emulators || []).find((e) => (e.id && e.id === prev.id) || (e.avd_name && e.avd_name === prev.avd_name));
            if (foundEmu && isOnline(foundEmu)) {
              if (prev.id === foundEmu.id && prev.status === foundEmu.status && prev.avd_name === foundEmu.avd_name) {
                return prev;
              }
              return foundEmu;
            }
          }

          const onlineReal = (data.real_devices || []).find(isOnline);
          if (onlineReal) return onlineReal;

          const onlineEmu = (data.emulators || []).find(isOnline);
          if (onlineEmu) return onlineEmu;

          if (prev) {
            const foundEmu = (data.emulators || []).find((e) => (e.id && e.id === prev.id) || (e.avd_name && e.avd_name === prev.avd_name));
            if (foundEmu) return foundEmu;
          }

          if (data.emulators && data.emulators.length > 0) {
            return data.emulators[0];
          }
          return null;
        });
      }
    } catch (err) {
      console.error('Failed to fetch devices list:', err);
    }
  };

  const startEmulator = async (avdName) => {
    setStartingEmulator(avdName);
    try {
      const res = await fetch('/api/emulator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avd_name: avdName }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDevicesList();
        if (data.device_id) {
          setSelectedDevice({
            id: data.device_id,
            name: avdName.replace(/_/g, ' '),
            avd_name: avdName,
            status: 'running',
            type: 'emulator',
          });
        }
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.detail || 'Failed to start emulator' };
      }
    } catch (err) {
      return { success: false, message: err.message };
    } finally {
      setStartingEmulator(null);
    }
  };

  const fetchDeviceInfo = async () => {
    try {
      const queryId = selectedDevice?.id ? `?device_id=${encodeURIComponent(selectedDevice.id)}` : '';
      const res = await fetch(`/api/device/info${queryId}`);
      if (res.ok) {
        const data = await res.json();
        setDeviceInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch device info:', err);
    }
  };

  // Live WebSocket Connection for Instant Device Connect/Disconnect Detection
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/logs`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WebSocket] Device monitor connected.');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && data.event === 'device_connected') {
              const dev = data.device;
              const isWifi = dev.connection === 'wifi' || dev.id?.includes(':');
              const devName = dev.name || dev.model || dev.id;
              
              // 1. Immediately trigger the Device Connected popup modal with specs
              setConnectedModalDevice(dev);
              
              // 2. Auto-select this newly connected phone as target device
              setSelectedDevice(dev);

              // 3. Show high-priority Toast
              showToast(
                `Device Connected: ${devName} (${isWifi ? 'Wi-Fi' : 'USB'})`,
                'success',
                6000
              );

              // 4. Add to notification center
              addNotification(
                'Device Connected',
                `${devName} was detected and configured as target execution device (${isWifi ? 'Wireless ADB' : 'USB'}).`,
                'success'
              );

              // 5. Instantly refresh device list and full specs
              fetchDevicesList();
              fetchDeviceInfo();
            } else if (data && data.event === 'device_disconnected') {
              const devId = data.device?.id;
              showToast(`Device Disconnected (${devId})`, 'warning', 4000);
              addNotification(
                'Device Disconnected',
                `Android device ${devId} was disconnected.`,
                'warning'
              );
              fetchDevicesList();
            }
          } catch (e) {
            // Not a JSON device event, ignore
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (err) {
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  useEffect(() => {
    fetchDevicesList();
    fetchDeviceInfo();
    fetchExecutionSession();
    const interval = setInterval(() => {
      fetchDevicesList();
      fetchDeviceInfo();
      fetchExecutionSession();
    }, 1500);
    return () => clearInterval(interval);
  }, [selectedDevice?.id]);

  const login = (email, password) => {
    if (email === 'callhealth@12' && password === 'AKM12') {
      localStorage.setItem('tb_auth', 'true');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('tb_auth');
    setIsAuthenticated(false);
  };

  const toggleTestSelection = (testPath) => {
    setSelectedTests((prev) => {
      if (prev.includes(testPath)) {
        const next = prev.filter((p) => p !== testPath);
        if (next.length === 0) setRunTarget('all');
        return next;
      } else {
        setRunTarget('selected');
        return [...prev, testPath];
      }
    });
  };

  const selectAllTests = () => {
    if (activeProject?.test_files) {
      setSelectedTests([...activeProject.test_files]);
      setRunTarget('selected');
    }
  };

  const deselectAllTests = () => {
    setSelectedTests([]);
    setRunTarget('all');
  };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        const projects = data.projects || [];
        setProjectsList(projects);

        // Auto-select saved or first available project if none active
        setActiveProject((current) => {
          if (current) return current;
          const savedName = localStorage.getItem('tb_active_project');
          if (savedName) {
            const matched = projects.find((p) => p.project_name === savedName);
            if (matched) {
              selectProject(matched);
              return matched;
            }
          }
          if (projects.length > 0) {
            selectProject(projects[0]);
            return projects[0];
          }
          return null;
        });
      }
    } catch (err) {
      console.error('Failed to fetch projects list:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const selectProject = async (project) => {
    if (!project) {
      localStorage.removeItem('tb_active_project');
      setActiveProject(null);
      setSelectedTest(null);
      setSelectedTests([]);
      setGeneratedReport(null);
      return;
    }

    const name = typeof project === 'string' ? project : project.project_name;
    localStorage.setItem('tb_active_project', name);
    setLoadingTests(true);
    setSelectedTest(null);
    setSelectedTests([]);
    setRunTarget('all');
    setGeneratedReport(null);

    if (typeof project === 'object') {
      setActiveProject(project);
    }

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
      if (res.ok) {
        const fullProjectData = await res.json();
        setActiveProject(fullProjectData);
      }
    } catch (err) {
      console.error(`Failed to fetch project details for ${name}:`, err);
    } finally {
      setLoadingTests(false);
    }
  };

  const handleUploadSuccess = async (uploadedProject) => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjectsList(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to re-fetch projects list post upload:', err);
    } finally {
      setLoadingProjects(false);
    }

    if (uploadedProject) {
      await selectProject(uploadedProject);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Live Stopwatch Ticker (Persistent & Wall-Clock Synchronized)
  useEffect(() => {
    let timer;
    if (isExecuting) {
      if (!executionStartTimeRef.current) {
        executionStartTimeRef.current = Date.now();
      }
      timer = setInterval(() => {
        if (executionStartTimeRef.current) {
          const diff = Math.max(0, Math.floor((Date.now() - executionStartTimeRef.current) / 1000));
          setElapsedSeconds(diff);
        }
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isExecuting]);

  // Formatted Elapsed Stopwatch Time (mm:ss)
  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const formattedElapsedTime = formatSeconds(elapsedSeconds);

  // Dynamic Browser Tab Title & Completion Notifications
  useEffect(() => {
    if (isExecuting) {
      document.title = `(▶ ${formattedElapsedTime}) ${activeProject?.project_name || 'TestBench'} - Running`;
      wasExecutingRef.current = true;
    } else {
      if (wasExecutingRef.current) {
        document.title = `(✓ Done) ${activeProject?.project_name || 'TestBench'}`;
        addNotification(
          'Execution Finished',
          `Test suite on ${activeProject?.project_name || 'project'} finished in ${formatSeconds(elapsedSeconds || 1)}.`,
          'success'
        );
        wasExecutingRef.current = false;
        setTimeout(() => {
          document.title = 'TestBench - TEST • VALIDATE • DELIVER';
        }, 5000);
      } else {
        document.title = 'TestBench - TEST • VALIDATE • DELIVER';
      }
    }
  }, [isExecuting, formattedElapsedTime, activeProject?.project_name]);

  const triggerExecution = async () => {
    if (!activeProject) {
      showToast('Please select an application to run tests', 'warning');
      return;
    }
    requestDesktopNotificationPermission();
    executionStartTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setIsExecuting(true);
    setOperatingMode('view');
    setExecutionStats((prev) => ({
      ...prev,
      startTime: Date.now(),
      endTime: null,
      totalExecutionTime: 0
    }));
    showToast(`Triggered test suite for ${activeProject.project_name}`, 'info');

    let targetFiles = [];
    if (runTarget === 'selected' && selectedTests && selectedTests.length > 0) {
      targetFiles = selectedTests;
    } else if (selectedTest) {
      targetFiles = [selectedTest];
    }

    let executeUrl = `/api/execute/${encodeURIComponent(activeProject.project_name)}`;
    const queryParams = [];
    if (targetFiles.length > 0) {
      queryParams.push(`test_file=${encodeURIComponent(targetFiles.join(','))}`);
    }
    if (selectedDevice?.id) {
      queryParams.push(`device_id=${encodeURIComponent(selectedDevice.id)}`);
    }
    if (queryParams.length > 0) {
      executeUrl += `?${queryParams.join('&')}`;
    }

    try {
      const resp = await fetch(executeUrl, { method: 'POST' });
      if (!resp.ok) {
        throw new Error(`Execution trigger failed with status ${resp.status}`);
      }
    } catch (e) {
      showToast(`Execution Error: ${e.message}`, 'error');
      setIsExecuting(false);
    }
  };

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const tag = e.target.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      // ? or Shift + / -> Toggle Shortcuts Modal (when not inside an input)
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }

      // Ctrl + Enter or Cmd + Enter -> Run Test
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        triggerExecution();
      }

      // R -> Refresh devices (when not in input)
      if ((e.key === 'r' || e.key === 'R') && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        fetchDevicesList();
        fetchDeviceInfo();
        showToast('Refreshing devices & telemetry', 'info', 1500);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeProject, selectedTest, selectedTests, selectedDevice, runTarget]);

  return (
    <ProjectContext.Provider
      value={{
        isAuthenticated,
        login,
        logout,
        activeProject,
        setActiveProject,
        selectedTest,
        setSelectedTest,
        selectedTests,
        setSelectedTests,
        runTarget,
        setRunTarget,
        toggleTestSelection,
        selectAllTests,
        deselectAllTests,
        selectedTestFile: selectedTest,
        setSelectedTestFile: setSelectedTest,
        projectsList,
        loadingProjects,
        loadingTests,
        generatedReport,
        setGeneratedReport,
        fetchProjects,
        selectProject,
        handleUploadSuccess,
        onUploadSuccess: handleUploadSuccess,
        operatingMode,
        setOperatingMode,
        isExecuting,
        setIsExecuting,
        triggerExecution,
        elapsedSeconds,
        formattedElapsedTime,
        deviceInfo,
        setDeviceInfo,
        fetchDeviceInfo,
        devicesList,
        setDevicesList,
        selectedDevice,
        setSelectedDevice,
        fetchDevicesList,
        startEmulator,
        startingEmulator,
        loadingDevices,
        executionStats,
        setExecutionStats,
        executionSession,
        setExecutionSession,
        activeSessions,
        toasts,
        showToast,
        removeToast,
        notifications,
        addNotification,
        markAllNotificationsRead,
        clearNotifications,
        unreadNotificationsCount,
        connectedModalDevice,
        setConnectedModalDevice,
        showShortcutsModal,
        setShowShortcutsModal,
        requestDesktopNotificationPermission,
      }}
    >
      {children}

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <ShortcutsModal />

      {/* Instant Device Connected Specs Popup Modal */}
      <DeviceConnectedModal />

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          let bg = 'bg-slate-900 text-white border-slate-800';
          let icon = <Info className="h-4 w-4 text-blue-400 shrink-0" />;
          if (toast.type === 'success') {
            bg = 'bg-emerald-950/90 text-emerald-100 border-emerald-800/80 shadow-emerald-900/20';
            icon = <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
          } else if (toast.type === 'error') {
            bg = 'bg-rose-950/90 text-rose-100 border-rose-800/80 shadow-rose-900/20';
            icon = <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />;
          } else if (toast.type === 'warning') {
            bg = 'bg-amber-950/90 text-amber-100 border-amber-800/80 shadow-amber-900/20';
            icon = <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg backdrop-blur-md text-xs font-medium flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200 ${bg}`}
            >
              <div className="flex items-center gap-2.5 truncate">
                {icon}
                <span className="truncate">{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-md text-slate-400 hover:text-white transition cursor-pointer shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
