import React, { useEffect, useState } from 'react';
import { Folder, File, Upload, RefreshCw, Trash2, HardDrive, CheckCircle2, AlertCircle, FilePlus } from 'lucide-react';

export default function WorkspaceView() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load workspace files:', err);
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
        setSelectedFile(null);
        fetchFiles();
      } else {
        setMessage({ type: 'error', text: data.detail || 'Upload failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Upload error: ${err.message}` });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto bg-slate-50 min-h-screen select-none">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <HardDrive className="h-6 w-6 text-blue-600" /> Workspace Manager
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Store, inspect, and upload user project packages into the root <code className="text-blue-600 font-mono font-bold">workspace/</code> directory.
          </p>
        </div>
        <button
          id="btn-refresh-workspace"
          onClick={fetchFiles}
          className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          Refresh Directory
        </button>
      </div>

      {/* Upload Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Upload className="h-4 w-4 text-blue-600" /> Upload Project Files
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
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Workspace Contents</span>
          <span className="text-xs text-slate-500 font-mono">{files.length} items found</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">Loading directory items...</div>
        ) : files.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Folder className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">Workspace is empty</p>
            <p className="text-[11px] text-slate-500">Upload project zip or code files above to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {files.map((item, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                <div className="flex items-center gap-3">
                  {item.is_directory ? (
                    <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                  ) : (
                    <File className="h-5 w-5 text-blue-500 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">workspace/{item.path}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-[11px] text-slate-500 font-mono">
                    {item.is_directory ? 'Directory' : `${(item.size_bytes / 1024).toFixed(1)} KB`}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    Ready
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
