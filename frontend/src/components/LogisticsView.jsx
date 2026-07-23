import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, BarChart3, PieChart as PieIcon, Layers, Cpu } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function LogisticsView() {
  const { activeProject } = useProject();
  const [analytics, setAnalytics] = useState({ passed: 0, failed: 0, skipped: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAnalytics = async () => {
    if (!activeProject?.project_name) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(activeProject.project_name)}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch project analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();

    const interval = setInterval(() => {
      fetchAnalytics();
    }, 3000);

    return () => clearInterval(interval);
  }, [activeProject?.project_name]);

  const chartData = [
    { name: 'Passed', value: analytics.passed, color: '#22C55E' },   // Green success
    { name: 'Failed', value: analytics.failed, color: '#EF4444' },   // Red failed
    { name: 'Skipped', value: analytics.skipped, color: '#F59E0B' },  // Amber skipped
  ];

  const hasData = analytics.passed > 0 || analytics.failed > 0 || analytics.skipped > 0;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white p-2.5 rounded-custom border border-custom-border text-xs font-mono shadow-md">
          <p className="font-bold" style={{ color: data.payload.color }}>
            {data.name}: {data.value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-custom border border-custom-border p-5 shadow-xs flex flex-col justify-between space-y-5">
      {/* Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-custom bg-brand/10 border border-brand/20 text-brand">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              Test Execution Logistics
            </h2>
            <p className="text-xs text-text-secondary">
              Parsed from Maven Surefire XML reports (3s auto-polling)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[11px] font-mono text-text-secondary hidden sm:inline">
              Updated: {lastUpdated}
            </span>
          )}
          <button
            id="btn-refresh-analytics"
            onClick={fetchAnalytics}
            className="px-3 py-1.5 rounded-custom bg-slate-50 border border-custom-border hover:bg-slate-100 text-text-primary text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {!activeProject ? (
        <div className="p-8 text-center border border-dashed border-custom-border rounded-custom bg-slate-50/50 space-y-2">
          <PieIcon className="h-8 w-8 text-slate-400 mx-auto" />
          <p className="text-xs font-semibold text-text-primary">No Application Selected</p>
          <p className="text-[11px] text-text-secondary">Select an application from the sidebar to view live test metrics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Recharts Donut Chart */}
          <div className="lg:col-span-6 h-56 relative flex items-center justify-center">
            {hasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-40 h-40 rounded-full border-8 border-slate-100 flex flex-col items-center justify-center text-center p-4">
                <span className="text-xl font-bold text-slate-400">0</span>
                <span className="text-[10px] text-text-secondary font-mono uppercase mt-0.5">No Runs Yet</span>
              </div>
            )}

            {hasData && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-2xl font-extrabold text-text-primary font-mono">{analytics.total}</span>
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Total Tests</span>
              </div>
            )}
          </div>

          {/* Reference StatCard Layout */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
            {/* Total Tests */}
            <div className="p-4 rounded-custom border border-custom-border border-l-4 border-l-brand bg-white shadow-xs flex items-center justify-between transition-all hover:shadow-sm">
              <div>
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider select-none block">
                  Total Executed
                </span>
                <span className="text-xs text-text-secondary">Scanned test suite</span>
              </div>
              <span className="text-2xl font-extrabold font-mono text-text-primary">{analytics.total}</span>
            </div>

            {/* Passed Card */}
            <div className="p-4 rounded-custom border border-custom-border border-l-4 border-l-success bg-white shadow-xs flex items-center justify-between transition-all hover:shadow-sm">
              <div>
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider select-none block">
                  Passed Tests
                </span>
                <span className="text-xs text-text-secondary">Successfully verified</span>
              </div>
              <span className="text-2xl font-extrabold font-mono text-success">{analytics.passed}</span>
            </div>

            {/* Failed Card */}
            <div className="p-4 rounded-custom border border-custom-border border-l-4 border-l-failed bg-white shadow-xs flex items-center justify-between transition-all hover:shadow-sm">
              <div>
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider select-none block">
                  Failed Tests
                </span>
                <span className="text-xs text-text-secondary">Assertions / errors</span>
              </div>
              <span className="text-2xl font-extrabold font-mono text-failed">{analytics.failed}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
