import { useEffect, type ReactNode } from "react";
import { QueryProvider } from "./QueryProvider";
import { AuthProvider } from "./AuthProvider";
import { ToastProvider } from "./ToastProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import { initPostHog } from "@/analytics/posthog";
import { useEffect, type ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';
import { AuthProvider } from './AuthProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { initPostHog } from '@/analytics/posthog';

// Fire the analytics init exactly once per page load — not per React
// island. Every Hugo page mounts its own React root through
// AppProviders, and without this guard we'd double-init, which
// produces duplicate session signals.
let analyticsInitCalled = false;
