import React from 'react';
import { Command, X, Play, RefreshCw, HardDrive, History, Settings, Search, HelpCircle, Laptop } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function ShortcutsModal() {
  const { showShortcutsModal, setShowShortcutsModal } = useProject();

  if (!showShortcutsModal) return null;

  const shortcutGroups = [
    {
      title: 'Execution & Control',
      shortcuts: [
        { keys: ['Ctrl', 'Enter'], desc: 'Run Selected / All Tests', icon: Play },
        { keys: ['Esc'], desc: 'Dismiss Modals / Close Search', icon: X },
        { keys: ['R'], desc: 'Re-scan Connected Devices & AVDs', icon: RefreshCw },
        { keys: ['?'], desc: 'Open / Close This Shortcuts Cheat Sheet', icon: HelpCircle },
      ],
    },
    {
      title: 'Navigation & Search',
      shortcuts: [
        { keys: ['Ctrl', 'K'], desc: 'Open Global Search Palette', icon: Search },
        { keys: ['D'], desc: 'Jump to Execution Workbench', icon: Laptop },
        { keys: ['W'], desc: 'Jump to Workspace Manager', icon: HardDrive },
        { keys: ['L'], desc: 'Jump to Logs & History Console', icon: History },
        { keys: ['S'], desc: 'Jump to Settings & Diagnostics', icon: Settings },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Command className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Keyboard Shortcuts</h3>
              <p className="text-[11px] text-slate-500">Fast navigation and execution key combinations</p>
            </div>
          </div>
          <button
            onClick={() => setShowShortcutsModal(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="space-y-4">
          {shortcutGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {group.title}
              </span>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl bg-slate-50/50 overflow-hidden">
                {group.shortcuts.map((sc, sIdx) => {
                  const Icon = sc.icon;
                  return (
                    <div
                      key={sIdx}
                      className="p-2.5 px-3 flex items-center justify-between hover:bg-white transition"
                    >
                      <div className="flex items-center gap-2.5 text-xs text-slate-700">
                        <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium">{sc.desc}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {sc.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-0.5 text-[11px] font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded-md shadow-xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100">
          <span>Tip: Press <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-slate-100 rounded border border-slate-200">?</kbd> anytime to open this sheet</span>
          <button
            onClick={() => setShowShortcutsModal(false)}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
