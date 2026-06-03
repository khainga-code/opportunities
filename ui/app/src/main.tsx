import { StrictMode, type ComponentType, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/providers/AppProviders";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { StrictMode, type ComponentType, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/providers/AppProviders';

// Every island is a [id → component] pair. Only the components whose mount
// target exists on the page get rendered. Components are lazy-imported so
// a page that only uses <Nav> doesn't pay for <Onboarding>'s form library.

type Island = {
  id: string;
  component: () => Promise<{ default: ComponentType<unknown> }>;
};

const islands: Island[] = [
  { id: 'mount-nav', component: () => import('@/components/Nav') },
  { id: 'mount-home-redirect', component: () => import('@/components/HomeRedirect') },
  // All five opportunity kinds share the same React island; the kind is
