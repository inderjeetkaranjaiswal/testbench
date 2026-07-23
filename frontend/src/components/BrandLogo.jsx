import React from 'react';

export default function BrandLogo({ size = 28, className = "" }) {
  return (
    <img
      src="/testbench-logo.png"
      alt="TestBench Official Logo"
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`object-contain shrink-0 rounded-md select-none ${className}`}
    />
  );
}
