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

