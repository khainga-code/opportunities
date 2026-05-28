import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppGate } from '@/components/AppGate';
import { SourceTrace } from '@/pages/SourceTrace';
import '@/styles/admin.css';

const container = document.getElementById('admin-root');
if (!container) throw new Error('admin-root element missing');

function Landing() {
  return (
    <div>
      <h1>Stawi Admin</h1>
      <p>
        Pick a source to view its trace: navigate to{' '}
        <code>/admin/sources/&lt;source-id&gt;</code>.
      </p>
    </div>
  );
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <AppGate>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/sources/:id" element={<SourceTrace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppGate>
    </BrowserRouter>
  </StrictMode>
);
