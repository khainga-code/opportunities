import { lazy, Suspense, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSnapshot } from "@/api/snapshot";
import { pingJobView, pingApply } from "@/api/views";
import { categoryLabel, isoInPast, timeAgo } from "@/utils/format";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSnapshot } from '@/api/snapshot';
import { pingJobView } from '@/api/views';
import { categoryLabel, isoInPast, timeAgo } from '@/utils/format';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import {
  setAnalyticsContext,
  trackApplyClick,
  trackJobView,
  trackJobViewEngaged,
} from '@/analytics/posthog';
import {
  isDeal,
  isFunding,
  isJob,
  isScholarship,
  isTender,
  type OpportunityKind,
  type OpportunitySnapshot,
} from '@/types/snapshot';

const JobBody = lazy(() => import('@/components/bodies/JobBody'));
const ScholarshipBody = lazy(() => import('@/components/bodies/ScholarshipBody'));
const TenderBody = lazy(() => import('@/components/bodies/TenderBody'));
const DealBody = lazy(() => import('@/components/bodies/DealBody'));
const FundingBody = lazy(() => import('@/components/bodies/FundingBody'));

export default function OpportunityDetail() {
  const { lang, t } = useI18n();

  const route = (() => {
    if (typeof window === 'undefined') return null;
    const m = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
    if (!m) return null;
    return { prefix: m[1]!, slug: decodeURIComponent(m[2]!) };
  })();

  const q = useQuery({
    queryKey: ['snapshot', route?.prefix, route?.slug, lang],
    queryFn: () => fetchSnapshot(route!.slug, lang, route!.prefix),
    enabled: !!route,
    staleTime: 5 * 60_000,
  });

  const ldRef = useRef<HTMLScriptElement | null>(null);
  const mountedAtRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  );

  useEffect(() => {
    if (!q.data) return;
    const snap = q.data;
    const sLang = snap.language ?? '';
    const showNotice = !!sLang && sLang !== lang;

    setAnalyticsContext('canonical_job_id', snap.id);
    setAnalyticsContext('slug', snap.slug);
    setAnalyticsContext('kind', snap.kind);
    setAnalyticsContext('ui_language', lang);
    setAnalyticsContext('snapshot_language', sLang);

    trackJobView({
      canonical_job_id: snap.id,
      slug: snap.slug,
      category: snap.categories?.[0],
      company: snap.issuing_entity,
      country: snap.anchor_location?.country,
      ui_language: lang,
      snapshot_language: sLang,
      translated_notice_shown: showNotice,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    });

    void pingJobView(snap.slug);

    const engagedAt = setTimeout(() => {
      const dwell = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - mountedAtRef.current
      );
      const doc = typeof document !== 'undefined' ? document.documentElement : null;
      const scrollPct = doc
        ? Math.min(
            100,
            Math.round(((window.scrollY + window.innerHeight) / (doc.scrollHeight || 1)) * 100)
          )
        : 0;
      trackJobViewEngaged({
        canonical_job_id: snap.id,
        slug: snap.slug,
        dwell_ms: dwell,
        scroll_depth_pct: scrollPct,
      });
    }, 10_000);

    return () => clearTimeout(engagedAt);
  }, [q.data, lang]);

  useEffect(() => {
    const el = ldRef.current;
    if (!el) return;
    if (!q.data || q.data.kind !== 'job') {
      el.textContent = '';
      return;
    }
    el.textContent = JSON.stringify(buildJobPostingLd(q.data));
  }, [q.data]);

  if (!route) return <NotFound kind={undefined} t={t} />;
  if (q.isLoading) return <Skeleton />;
  if (q.isError) return <LoadError onRetry={() => q.refetch()} t={t} />;
  if (!q.data) return <NotFound kind={inferKindFromPrefix(route.prefix)} t={t} />;

  const snap = q.data;
  const expired = isoInPast(snap.deadline) || isoInPast(snap.expires_at);
  const canApply = !!snap.apply_url && !expired;

  const showTranslatedNotice = !!snap.language && snap.language !== lang;
  const primaryCategory = snap.categories?.[0];

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <script ref={ldRef} type="application/ld+json" />

      <Breadcrumbs prefix={route.prefix} category={primaryCategory} t={t} />

      {expired && (
        <div
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
          role="status"
        >
          {expiredMessage(snap.kind, t)}
        </div>
      )}

      {showTranslatedNotice && (
        <div
          className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900"
          role="status"
        >
          {t('job.translatedNotice')}
        </div>
      )}

      <header className="mt-4 flex items-start gap-4">
        <IssuingEntityAvatar snap={snap} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{snap.title}</h1>
          <p className="mt-1 text-sm text-gray-700">
            <span className="font-medium">{snap.issuing_entity}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            {snap.anchor_location?.city && <span>{snap.anchor_location.city}</span>}
            {snap.anchor_location?.region && <span>{snap.anchor_location.region}</span>}
            {snap.anchor_location?.country && <span>{snap.anchor_location.country}</span>}
            {snap.remote && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                {t('job.remote')}
              </span>
            )}
            {snap.posted_at && (
              <span className="text-gray-400">
                {t('job.postedOn')} {timeAgo(snap.posted_at)}
              </span>
            )}
            {snap.deadline && !expired && (
              <span className="text-orange-700">
                {deadlineLabel(snap.kind, t)} {new Date(snap.deadline).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {canApply && <ApplyLink snap={snap} mountedAtRef={mountedAtRef} t={t} />}
            <ShareButton title={snap.title} subtitle={snap.issuing_entity} t={t} />
          </div>
        </div>
      </header>

      <Suspense fallback={<BodyFallback />}>
        {isJob(snap) && <JobBody snap={snap} />}
        {isScholarship(snap) && <ScholarshipBody snap={snap} />}
        {isTender(snap) && <TenderBody snap={snap} />}
        {isDeal(snap) && <DealBody snap={snap} />}
        {isFunding(snap) && <FundingBody snap={snap} />}
      </Suspense>

      {canApply && (
        <div className="mt-12 flex justify-center">
          <ApplyLink snap={snap} mountedAtRef={mountedAtRef} t={t} large />
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ApplyLink({
  snap,
  mountedAtRef,
  t,
  large = false,
}: {
  snap: OpportunitySnapshot;
  mountedAtRef: { current: number };
  t: (k: StringKey, fallback?: string) => string;
  large?: boolean;
}) {
  const className = large ? 'btn-primary px-8 py-3 text-base' : 'btn-primary';
  return (
    <a
      href={snap.apply_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        trackApplyClick({
          canonical_job_id: snap.id,
          slug: snap.slug,
          company: snap.issuing_entity,
          apply_url: snap.apply_url ?? '',
          dwell_ms: Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
              mountedAtRef.current
          ),
        });
        pingApply(snap.slug);
      }}
      className={className}
    >
      {applyCtaLabel(snap.kind, t)}
      {!large && (
        <svg className="ml-1.5 h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 100-2H5z" />
        </svg>
      )}
    </a>
  );
}

function applyCtaLabel(
  kind: OpportunityKind,
  t: (k: StringKey, fallback?: string) => string
): string {
  switch (kind) {
    case 'deal':
      return t('cta.redeemNow');
    case 'tender':
      return t('cta.submitBid');
    case 'scholarship':
    case 'funding':
    case 'job':
    default:
      return t('cta.applyNow');
  }
}

function deadlineLabel(
  kind: OpportunityKind,
  t: (k: StringKey, fallback?: string) => string
): string {
  switch (kind) {
    case 'tender':
      return t('deadline.closes');
