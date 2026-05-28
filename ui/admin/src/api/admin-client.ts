import { createAuthRuntime, type AuthRuntime } from '@stawi/auth-runtime';
import { getConfig } from '@/utils/config';

// Module-level singleton — same pattern as ui/app/src/auth/runtime.ts.
// One auth runtime across the SPA so React components and any
// non-React helpers share token + role state.
let instance: AuthRuntime | null = null;

function authRuntime(): AuthRuntime {
  if (instance) return instance;
  const cfg = getConfig();
  instance = createAuthRuntime({
    clientId: cfg.oidcClientID,
    installationId: cfg.oidcInstallationID,
    idpBaseUrl: cfg.oidcIssuer,
    // Admin /admin/trace/* and /admin/raw_payloads/* are served by the
    // api service at the bare api.stawi.org root (alongside /jobs/*).
    // candidatesAPIURL is the bare root by convention; the matching
    // service's /matching/* prefix is added inline by call sites.
    apiBaseUrl: cfg.candidatesAPIURL,
    redirectUri: cfg.oidcRedirectURI,
    scopes: ['openid', 'profile', 'offline_access'],
    skipFedCM: true,
  });
  return instance;
}

export async function getRoles(): Promise<string[]> {
  return authRuntime().getRoles();
}

export async function fetchAdminJSON<T = unknown>(path: string): Promise<T> {
  return authRuntime().fetch<T>(path);
}

// Response shapes — mirror the JSON returned by apps/api/cmd/trace_admin.go.
export type SourceTraceResponse = {
  source: {
    id: string;
    type: string;
    base_url: string;
    country: string;
    status: string;
    health_score: number;
    next_crawl_at: string | null;
    last_seen_at: string | null;
  };
  summary: {
    window: string;
    crawl_jobs: number;
    crawl_jobs_failed: number;
    raw_payloads: number;
    variants_emitted: number;
    variants_published: number;
    variants_rejected: number;
    rejection_reasons: Record<string, number>;
  };
  recent_crawls: Array<{
    crawl_job_id: string;
    scheduled_at: string;
    started_at: string | null;
    finished_at: string | null;
    duration_ms: number;
    status: string;
    jobs_found: number;
    jobs_stored: number;
    raw_payloads: number;
    error_code?: string;
  }>;
};
