import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';

const CreatePage = lazy(() => import('./pages/CreatePage.jsx'));
const PastePage = lazy(() => import('./pages/PastePage.jsx'));
const ExplorePage = lazy(() => import('./pages/ExplorePage.jsx'));
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } } });

function RouteFallback() {
  return <main className="page"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-block" /></main>;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><Suspense fallback={<RouteFallback />}>
        <Routes><Route path="/" element={<CreatePage />} /><Route path="/p/:id" element={<PastePage />} /><Route path="/explore" element={<ExplorePage />} /><Route path="*" element={<CreatePage />} /></Routes>
      </Suspense></BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
