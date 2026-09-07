import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  File,
  Upload,
  RefreshCw,
  Trash2,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  FilePlus,
  Search,
  ArrowUpRight,
  Eye,
  X,
  Copy,
  Check,
  Code2
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function WorkspaceView() {
  const navigate = useNavigate();
  const { projectsList, selectProject, showToast } = useProject();

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [inspectingItem, setInspectingItem] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.items || []);
        showToast('Workspace refreshed', 'info', 2000);
      }
    } catch (err) {
      console.error('Failed to load workspace files:', err);
      showToast('Failed to load workspace directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/workspace/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        showToast(data.message || 'File uploaded successfully', 'success');
        setSelectedFile(null);
        fetchFiles();
      } else {
        setMessage({ type: 'error', text: data.detail || 'Upload failed' });
        showToast(data.detail || 'Upload failed', 'error');
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Upload error: ${err.message}` });
      showToast(`Upload error: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const filteredFiles = files.filter((item) =>
    (item.name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
    (item.path || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleLaunchProject = async (folderName) => {
    const matched = (projectsList || []).find((p) => p.project_name === folderName);
    if (matched) {
      await selectProject(matched);
    } else {
      await selectProject(folderName);
    }
    showToast(`Loaded ${folderName} in Workbench`, 'success');
    navigate('/dashboard');
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto bg-slate-50 min-h-screen select-none">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <HardDrive className="h-6 w-6 text-blue-600" /> Workspace Manager
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Store, inspect, and manage test suites inside the root <code className="text-blue-600 font-mono font-bold">workspace/</code> directory.
          </p>
        </div>
        <button
          id="btn-refresh-workspace"
          onClick={fetchFiles}
          className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          Refresh Directory
        </button>
      </div>

      {/* Upload Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Upload className="h-4 w-4 text-blue-600" /> Upload Project Files or Archives
        </h2>

        {message && (
          <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
            message.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <label className="flex-1 cursor-pointer">
            <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-4 text-center bg-slate-50 hover:bg-blue-50/30 transition flex items-center justify-center gap-3">
              <FilePlus className="h-5 w-5 text-blue-600" />
              <span className="text-xs text-slate-600 font-medium truncate">
                {selectedFile ? selectedFile.name : 'Click to select project archive or file to upload'}
              </span>
            </div>
            <input
              id="file-upload-input"
              type="file"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              className="hidden"
            />
          </label>
          <button
            id="btn-submit-upload"
            type="submit"
            disabled={!selectedFile || uploading}
            className={`px-6 py-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              selectedFile && !uploading
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <Upload className={`h-4 w-4 ${uploading ? 'animate-bounce' : ''}`} />
            {uploading ? 'Uploading...' : 'Upload File'}
          </button>
        </form>
      </div>

      {/* Directory Contents Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Workspace Contents</span>
            <span className="text-xs text-slate-400 font-mono">({filteredFiles.length} items)</span>
          </div>

          {/* Filter search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter workspace files..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">Loading directory items...</div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Folder className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No items found</p>
            <p className="text-[11px] text-slate-500">
              {searchFilter ? 'Try clearing your filter search above.' : 'Upload project zip or code files above to get started.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredFiles.map((item, idx) => (
              <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition">
                <div className="flex items-center gap-3">
                  {item.is_directory ? (
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
                      <Folder className="h-4 w-4 shrink-0" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                      <File className="h-4 w-4 shrink-0" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">workspace/{item.path}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  <span className="text-[11px] text-slate-500 font-mono">
                    {item.is_directory ? 'Directory' : `${(item.size_bytes / 1024).toFixed(1)} KB`}
                  </span>

                  {item.is_directory ? (
                    <button
                      onClick={() => handleLaunchProject(item.name)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <span>Open in Workbench</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setInspectingItem(item)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-400" />
                      <span>Inspect</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Inspector Modal */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
                  <Code2 className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 truncate max-w-xs">{inspectingItem.name}</h3>
              </div>
              <button
                onClick={() => setInspectingItem(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 font-mono bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-400">File Name:</span>
                <span className="font-bold text-slate-800">{inspectingItem.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Relative Path:</span>
                <span className="text-slate-700">workspace/{inspectingItem.path}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Size:</span>
                <span className="text-slate-700">{(inspectingItem.size_bytes / 1024).toFixed(2)} KB ({inspectingItem.size_bytes} bytes)</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`workspace/${inspectingItem.path}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                  showToast('Copied path to clipboard', 'info');
                }}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                <span>{copied ? 'Path Copied' : 'Copy File Path'}</span>
              </button>

              <button
                onClick={() => setInspectingItem(null)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
