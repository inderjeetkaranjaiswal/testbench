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

  const fetchDeviceInfo = async () => {
    try {
      const res = await fetch('/api/device/info');
      if (res.ok) {
        const data = await res.json();
        setDeviceInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch device info:', err);
    }
  };

  useEffect(() => {
    fetchDeviceInfo();
    const interval = setInterval(fetchDeviceInfo, 4000);
    return () => clearInterval(interval);
  }, []);

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
    setGeneratedReport(null); // Reset generated report on project switch

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
        executionStats,
        setExecutionStats,
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
