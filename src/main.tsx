import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ensure the PDF worker is set up correctly
import * as pdfjsLib from 'pdfjs-dist';
// Set up worker using CDN for maximum reliability in both dev and prod
console.log('[main] PDF.js version:', pdfjsLib.version);
const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
console.log('[main] PDF.js workerSrc set to:', workerUrl);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
