import { useEffect, useRef } from "react";
import { mount as mountProfile, type MountHandle } from "@stawi/profile";
import { authRuntime } from "@/auth/runtime";
import { profileWidgetTokens, profileWidgetCSS } from "@/theme/profile-widget";
import { useAuth } from "@/providers/AuthProvider";
import { getConfig } from "@/utils/config";
import { useSubscription } from "@/hooks/useSubscription";
import { normalizePlan } from "@/utils/plans";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AgentCard } from "@/components/dashboard/AgentCard";
import { MatchesPanel } from "@/components/dashboard/MatchesPanel";
import { SavedJobsPanel } from "@/components/dashboard/SavedJobsPanel";
import { ApplicationsPanel } from "@/components/dashboard/ApplicationsPanel";
import { BillingPanel } from "@/components/dashboard/BillingPanel";
import { PreferencesPanel } from "@/components/dashboard/PreferencesPanel";
import { CompletePaymentPanel } from "@/components/dashboard/CompletePaymentPanel";
import { PendingCheckoutPoller } from "@/components/dashboard/PendingCheckoutPoller";
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mount as mountProfile, type MountHandle } from '@stawi/profile';
import { authRuntime } from '@/auth/runtime';
import { profileWidgetTokens, profileWidgetCSS } from '@/theme/profile-widget';
import { useAuth } from '@/providers/AuthProvider';
import { getConfig } from '@/utils/config';
import { fetchMeSubscription, createCheckout, pollCheckoutStatus } from '@/api/candidates';
import { OpportunitiesFeed } from '@/components/OpportunitiesFeed';
import { normalizePlan, planById, type PlanId } from '@/utils/plans';
import { OnboardingRouter } from '@/onboarding/router';
import { useI18n } from '@/i18n/I18nProvider';

const PENDING_PROMPT_KEY = 'stawi.billing.pending_prompt_id';

const PREFERENCE_KINDS: ReadonlyArray<{
  kind: string;
  flow: string;
  labelKey: import('@/i18n/strings').StringKey;
}> = [
  { kind: 'job', flow: 'job-onboarding-v1', labelKey: 'kind.job' },
  { kind: 'scholarship', flow: 'scholarship-onboarding-v1', labelKey: 'kind.scholarship' },
  { kind: 'tender', flow: 'tender-onboarding-v1', labelKey: 'kind.tender' },
  { kind: 'deal', flow: 'deal-onboarding-v1', labelKey: 'kind.deal' },
  { kind: 'funding', flow: 'funding-onboarding-v1', labelKey: 'kind.funding' },
];

export default function Dashboard() {
  const { state, login } = useAuth();

  const subQ = useSubscription();
  const subQ = useQuery({
    queryKey: ['me-subscription'],
    queryFn: fetchMeSubscription,
    enabled: state === 'authenticated',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (state !== 'authenticated') return;
    if (subQ.isLoading) return;
    if (subQ.data?.status !== 'active') {
      window.location.assign('/onboarding/');
    }
  }, [state, subQ.isLoading, subQ.data?.status]);

  if (state === 'initializing') return <Skeleton />;
  if (state !== 'authenticated') return <SignedOut onSignIn={login} />;

  const sub = subQ.data;
  const plan = normalizePlan(sub?.plan ?? null);
  const isActive = sub?.status === 'active';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <DashboardHeader plan={plan} active={isActive} />
      <PendingCheckoutPoller />

      <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside>
          <ProfileMount />
        </aside>
        <section className="space-y-6">
          {plan === null || !isActive ? (
            <CompletePaymentPanel plan={plan} status={sub?.status ?? 'none'} />
          ) : (
            <>
              {plan === 'managed' && sub?.agent && <AgentCard agent={sub.agent} />}
              <OpportunitiesFeed />
            </>
          )}
          <PreferencesPanel />
          {plan && isActive && <BillingPanel plan={plan} renewsAt={sub?.renews_at} />}
        </section>
      </div>
    </div>
  );
}

function DashboardHeader({ plan, active }: { plan: PlanId | null; active: boolean }) {
  const { t } = useI18n();
  const label = plan && active ? planById(plan).name : t('dash.setupIncomplete');
  const tagline = plan && active ? planById(plan).tagline : t('dash.finishPayment');
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('dash.title')}</h1>
        <p className="mt-1 flex items-center gap-2 text-gray-600">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              plan && active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {label}
          </span>
          <span>{tagline}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <a href="/jobs/" className="text-sm font-medium text-gray-700 hover:text-navy-900">
          {t('dash.browseJobs')}
        </a>
        {plan !== 'managed' && (
          <a
            href="/pricing/"
