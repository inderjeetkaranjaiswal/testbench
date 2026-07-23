import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Folder, FileSpreadsheet, Download, User, LogOut, ChevronDown } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function Header() {
  const { generatedReport, logout } = useProject();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-[64px] bg-white border-b border-custom-border px-6 flex items-center justify-between sticky top-0 z-20 select-none">
      <div className="flex items-center gap-4 w-96">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            id="global-search-input"
            type="text"
            placeholder="Search projects, logs, or workspace files..."
            className="w-full bg-slate-50 border border-custom-border rounded-custom pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand transition font-sans"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Download Excel Report Button */}
        {generatedReport && (
          <a
            id="btn-download-excel-report"
            href={generatedReport.download_url}
            download={generatedReport.file_name}
            className="px-3.5 py-1.5 rounded-custom bg-success hover:bg-emerald-600 text-white font-bold text-xs shadow-xs flex items-center gap-2 transition animate-bounce border border-emerald-600 cursor-pointer"
            title={`Download ${generatedReport.file_name}`}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-white" />
            <span className="truncate max-w-xs">Download Excel Report</span>
            <Download className="h-3.5 w-3.5" />
          </a>
        )}

        {/* Workspace status badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-custom bg-slate-50 border border-custom-border text-xs font-medium text-text-secondary">
          <Folder className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-text-primary">workspace/</span>
          <span className="w-2 h-2 rounded-full bg-success"></span>
        </div>

        <button
          id="btn-notifications"
          className="p-1.5 rounded-custom border border-custom-border bg-slate-50 hover:bg-slate-100 text-text-secondary hover:text-text-primary transition relative cursor-pointer"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-brand rounded-full"></span>
        </button>

        {/* Profile Avatar & Interactive Dropdown Menu */}
        <div className="relative border-l border-custom-border pl-3" ref={dropdownRef}>
          <button
            id="btn-profile-dropdown"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1 rounded-custom hover:bg-slate-50 border border-transparent hover:border-custom-border transition cursor-pointer"
          >
            <img
              src="/testbench-logo.png"
              alt="TestBench Logo"
              className="h-8 w-8 rounded-full object-contain border border-brand/20 p-0.5 bg-slate-50 shadow-xs shrink-0"
            />
            <div className="text-left hidden md:block">
              <p className="text-xs font-bold text-text-primary leading-tight">CallHealth Admin</p>
              <p className="text-[10px] text-text-secondary font-mono leading-tight">callhealth@12</p>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 hidden md:block ${showProfileMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Profile Dropdown Menu Card */}
          {showProfileMenu && (
            <div className="absolute right-0 top-12 w-56 bg-white border border-custom-border rounded-custom shadow-md p-2 z-50 animate-fadeIn space-y-1">
              <div className="p-2.5 bg-slate-50 rounded-custom border border-custom-border mb-1">
                <p className="text-xs font-bold text-text-primary">CallHealth Admin</p>
                <p className="text-[11px] text-text-secondary font-mono">callhealth@12</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                  Active Session
                </span>
              </div>

              <button
                id="btn-profile-logout"
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-custom transition cursor-pointer text-left"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
