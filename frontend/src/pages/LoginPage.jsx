import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useProject();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const success = login(email, password);
      setLoading(false);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Invalid Email or Password. Please check your credentials.');
      }
    }, 350);
  };

  return (
    <div className="min-h-screen bg-custom-bg flex items-center justify-center p-4 relative select-none">
      {/* Background Decorative Accent Elements */}
      <div className="absolute top-12 left-12 w-72 h-72 bg-brand/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-12 right-12 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-white border border-custom-border rounded-custom p-8 shadow-xs relative z-10 space-y-6">
        {/* Brand Logo Header */}
        <div className="text-center space-y-3">
          <img
            src="/testbench-logo.png"
            alt="TestBench Official Logo"
            className="w-24 h-24 object-contain mx-auto select-none"
          />
          <div>
            <h1 className="text-2xl font-extrabold text-text-primary tracking-tight font-sans">
              TestBench
            </h1>
            <p className="text-[10px] font-bold font-mono text-brand tracking-widest uppercase mt-1">
              TEST • VALIDATE • DELIVER
            </p>
          </div>
          <p className="text-xs text-text-secondary font-medium">
            Sign in to access your automated test workspace
          </p>
        </div>

        {/* Validation Error Alert */}
        {error && (
          <div className="p-3 rounded-custom bg-red-50 border border-red-200 text-red-600 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="login-email-input"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="callhealth@12"
                className="w-full bg-slate-50 border border-custom-border rounded-custom pl-10 pr-4 py-2 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition font-mono"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-custom-border rounded-custom pl-10 pr-10 py-2 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="btn-login-submit"
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-custom bg-brand hover:bg-brand-hover text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
            ) : (
              'Sign In to TestBench'
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="text-center border-t border-slate-100 pt-4">
          <p className="text-[11px] text-text-secondary font-mono">
            TestBench Security Authentication v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
