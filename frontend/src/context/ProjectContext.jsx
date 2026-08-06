import React, { createContext, useContext, useState, useEffect } from 'react';

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

  // Interactive Mirroring & Execution Telemetry States
  const [operatingMode, setOperatingMode] = useState('view'); // 'view' | 'interactive'
  const [isExecuting, setIsExecuting] = useState(false);
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

  const fetchExecutionSession = async () => {
    try {
      const res = await fetch('/api/execution/session');
      if (res.ok) {
        const data = await res.json();
        if (data && data.execution_id) {
          setExecutionSession(data);
          setIsExecuting(data.status === 'RUNNING');
        }
      }
    } catch (err) {}
  };

  const fetchDevicesList = async () => {
    setLoadingDevices(true);
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevicesList(data);

        setSelectedDevice((prev) => {
          if (prev) {
            const foundReal = (data.real_devices || []).find((d) => d.id === prev.id);
            if (foundReal) return foundReal;
            const foundEmu = (data.emulators || []).find((e) => (e.id && e.id === prev.id) || e.avd_name === prev.avd_name);
            if (foundEmu) return foundEmu;
          }

          if (data.real_devices && data.real_devices.length > 0) {
            return data.real_devices[0];
          }
          const pixel6aRunning = (data.emulators || []).find(
            (e) => e.status === 'running' && (e.avd_name === 'Pixel_6a' || e.name?.toLowerCase().includes('pixel 6a'))
          );
          if (pixel6aRunning) return pixel6aRunning;

          const runningEmu = (data.emulators || []).find((e) => e.status === 'running');
          if (runningEmu) return runningEmu;

          const pixel6aAvd = (data.emulators || []).find(
            (e) => e.avd_name === 'Pixel_6a' || e.name?.toLowerCase().includes('pixel 6a')
          );
          if (pixel6aAvd) return pixel6aAvd;

          if (data.emulators && data.emulators.length > 0) {
            return data.emulators[0];
          }
          return null;
        });
      }
    } catch (err) {
      console.error('Failed to fetch devices list:', err);
    } finally {
      setLoadingDevices(false);
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

  useEffect(() => {
    fetchDevicesList();
    fetchDeviceInfo();
    fetchExecutionSession();
    const interval = setInterval(() => {
      fetchDevicesList();
      fetchDeviceInfo();
      fetchExecutionSession();
    }, 2000);
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
        setProjectsList(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to fetch projects list:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const selectProject = async (project) => {
    if (!project) {
      setActiveProject(null);
      setSelectedTest(null);
      setSelectedTests([]);
      setGeneratedReport(null);
      return;
    }

    const name = typeof project === 'string' ? project : project.project_name;
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
      }}
    >
      {children}
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
