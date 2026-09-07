import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  FolderTree,
  Cpu,
  Play,
  BookOpen,
  Clapperboard,
  X,
  FileText,
  Check,
  Boxes,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function LandingPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Modals for Tour & Documentation
  const [showTourModal, setShowTourModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);

  const zipInputRef = useRef(null);
  const navigate = useNavigate();
  const { setActiveProject, handleUploadSuccess, projectsList, selectProject, showToast } = useProject();

  const supportedTechnologies = ['ZIP', 'Java', 'Python', 'JavaScript', 'TypeScript', 'Kotlin', 'C#'];

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const validateAndSetFile = (selectedFile) => {
    setError(null);
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.zip')) {
      setError('Please select a valid .zip archive file.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const uploadZipFile = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(10);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 90);
          setProgress(percentComplete);
        }
      };

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const errJson = JSON.parse(xhr.responseText);
              reject(new Error(errJson.detail || 'Upload failed on server'));
            } catch (e) {
              reject(new Error(`Server error (${xhr.status})`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error during file upload'));
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

      const result = await uploadPromise;
      setProgress(100);

      await handleUploadSuccess(result);

      setTimeout(() => {
        navigate('/dashboard', { state: { project: result } });
      }, 400);

    } catch (err) {
      console.error('Upload Error:', err);
      setError(err.message || 'Failed to upload project');
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-10 px-4 md:px-8 max-w-4xl mx-auto space-y-6 select-none bg-slate-50">

      {/* Hidden File Inputs */}
      <input
        id="zip-file-input"
        ref={zipInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />

      {/* MAIN UPLOADER CARD (Matching Screenshot 2) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 md:p-10">
        <div
          id="dropzone-container"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-xl p-8 md:p-10 text-center transition-all duration-200 border-2 border-dashed ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 scale-[1.005]'
              : file
              ? 'border-emerald-400 bg-emerald-50/30'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          {uploading ? (
            /* Upload Progress State */
            <div className="space-y-5 py-4 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-blue-600 animate-pulse">
                <FileArchive className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Uploading & Parsing Framework...</h3>
                <p className="text-xs text-slate-500 font-mono mt-1 truncate">{file?.name}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <p className="text-xs font-mono font-bold text-blue-600">{progress}% complete</p>
            </div>
          ) : file ? (
            /* Selected File Ready to Extract */
            <div className="space-y-5 py-2 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Project File Ready</span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5 truncate">{file.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  id="btn-cancel-file"
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  Choose Different File
                </button>
                <button
                  id="btn-start-upload"
                  type="button"
                  onClick={uploadZipFile}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer"
                >
                  Extract & Open Dashboard <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Default Idle Upload Box (Exact Screenshot 2 Design) */
            <div className="space-y-4">
              {/* Cloud Upload Icon Badge */}
              <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-blue-600">
                <UploadCloud className="h-7 w-7" />
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-1.5 max-w-lg mx-auto">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                  Upload Your Test Automation Project
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Upload your complete automation framework or project folder. We'll parse it, scan for test suites, and load your target configuration.
                </p>
              </div>

              {/* Error Banner if any */}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-center gap-2 max-w-md mx-auto">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Button: Upload ZIP */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2 pb-4">
                <button
                  id="btn-upload-zip"
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer"
                >
                  Upload ZIP
                </button>
              </div>

              {/* Supported Technologies Row */}
              <div className="pt-4 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
                  SUPPORTED TECHNOLOGIES
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {supportedTechnologies.map((tech) => (
                    <span
                      key={tech}
                      className="px-3.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DISCOVERED WORKSPACE PROJECTS (Quick-Start Cards) */}
      {projectsList && projectsList.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Boxes className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Workspace Applications Ready to Execute</h3>
                <p className="text-[11px] text-slate-500">Pick any detected test automation suite to launch directly into the workbench</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
              {projectsList.length} Active {projectsList.length === 1 ? 'Suite' : 'Suites'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {projectsList.map((proj, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-sm transition group flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-600 transition block truncate max-w-[220px]">
                      {proj.project_name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {proj.test_count ?? proj.test_files?.length ?? 0} automated tests detected
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase shrink-0">
                    {proj.framework_type || 'Custom'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await selectProject(proj);
                    showToast(`Opened ${proj.project_name} in Workbench`, 'success');
                    navigate('/dashboard');
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-white group-hover:bg-blue-600 group-hover:text-white border border-slate-200 group-hover:border-blue-600 text-slate-700 text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>Launch in Workbench</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRODUCT TOUR CARD (Matching Screenshot 2 Bottom Card) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2 rounded-lg bg-slate-100 text-slate-800 shrink-0 mt-0.5">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Product Tour</h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-0.5 max-w-xl">
              New to TestBench? Watch a quick walkthrough to learn how to upload automation projects, execute tests, monitor live execution, and download reports.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            id="btn-documentation"
            type="button"
            onClick={() => setShowDocsModal(true)}
            className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer"
          >
            <BookOpen className="h-4 w-4 text-slate-500" />
            Documentation
          </button>
          <button
            id="btn-product-tour"
            type="button"
            onClick={() => setShowTourModal(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Product Tour
          </button>
        </div>
      </div>

      {/* PRODUCT TOUR MODAL */}
      {showTourModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
                  <Play className="h-4 w-4 fill-current" />
                </div>
                <h3 className="text-base font-bold text-slate-900">TestBench Quick Tour</h3>
              </div>
              <button
                onClick={() => setShowTourModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                <div>
                  <p className="font-bold text-slate-900">Upload Automation Archives</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Drop Maven, Playwright, or JS test frameworks. Bloat like target and node_modules is cleaned automatically.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                <div>
                  <p className="font-bold text-slate-900">Inspect Tests & File Tree</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Select specific test classes from the sidebar or inspect extracted workspace files in real-time.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
                <div>
                  <p className="font-bold text-slate-900">Live Streaming & Metrics</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Watch XTerm.js logs stream live during execution while monitoring ADB emulator screens and downloading Excel reports.</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowTourModal(false)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENTATION MODAL */}
      {showDocsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
                  <BookOpen className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Platform Documentation</h3>
              </div>
              <button
                onClick={() => setShowDocsModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p className="leading-relaxed">
                TestBench provides a complete local web runtime for executing end-to-end automation projects inside a sanitized workspace.
              </p>
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Maven Surefire XML parsing for automated analytics</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>WebSocket XTerm.js live log streaming</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Android ADB screencap streaming with FPS ticker</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Automated Excel report generation (.xlsx)</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowDocsModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
