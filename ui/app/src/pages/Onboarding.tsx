import { useEffect, useId, useMemo, useState } from "react";
import { useForm, type SubmitHandler, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/providers/AuthProvider";
import { submitOnboarding, uploadCV } from "@/api/profile";
import { createCheckout } from "@/api/billing";
import { PLANS, planById, type PlanId } from "@/utils/plans";
import { useEffect, useId, useMemo, useState } from 'react';
import { useForm, type SubmitHandler, type UseFormReturn } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/providers/AuthProvider';
import {
  submitOnboarding,
  uploadCV,
  createCheckout,
  fetchOnboardingDraft,
  saveOnboardingDraft,
  fetchMeSubscription,
  type OnboardingDraftFields,
} from '@/api/candidates';
import { PLANS, planById, type PlanId } from '@/utils/plans';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';

type FormValues = Omit<z.infer<typeof Step1Schema>, 'cv'> & { cv?: File } & z.infer<
    typeof Step2Schema
  > &
  z.infer<typeof Step3Schema>;

const Step1Schema = z
  .object({
    cv: z
      .any()
      .optional()
      .refine((v) => !v || v instanceof File, 'Invalid file')
      .refine(
        (v) => !(v instanceof File) || v.size <= 10 * 1024 * 1024,
        'CV must be 10 MB or smaller'
      )
      .refine(
        (v) => !(v instanceof File) || /\.(pdf|docx?|rtf|txt)$/i.test(v.name),
        'Upload a PDF, DOCX, RTF, or TXT file'
      ),
    extraInfo: z.string().optional(),
    salaryAmount: z.coerce.number().nonnegative().optional(),
    salaryCurrency: z.string().optional(),
  })
  .refine((d) => d.cv instanceof File || (d.extraInfo && d.extraInfo.trim().length > 0), {
    path: ['extraInfo'],
    message: 'Provide a CV or tell us about yourself',
  });

const Step2Schema = z.object({
  preferredRegions: z.array(z.string()).min(1),
  country: z.string().min(2),
  preferredTimezones: z.array(z.string()),
  preferredLanguages: z.array(z.string()).min(1),
  jobTypes: z.array(z.string()).min(1),
});

const Step3Schema = z.object({
  plan: z.enum(['starter', 'pro', 'managed']),
  agreeTerms: z.literal(true),
});

const STEP_LABEL_KEYS: StringKey[] = [
  'onboard.aboutYou',
  'onboard.yourPreferences',
  'onboard.choosePlan',
];

const REGION_KEYS: { value: string; labelKey: StringKey }[] = [
  { value: 'Anywhere', labelKey: 'onboard.anywhere' },
  { value: 'Africa', labelKey: 'onboard.africa' },
  { value: 'Europe', labelKey: 'onboard.europe' },
  { value: 'North America', labelKey: 'onboard.northAmerica' },
  { value: 'South America', labelKey: 'onboard.southAmerica' },
  { value: 'Asia', labelKey: 'onboard.asia' },
  { value: 'Oceania', labelKey: 'onboard.oceania' },
];

const TIMEZONES = [
  'EAT (UTC+3)',
  'WAT (UTC+1)',
  'CAT (UTC+2)',
  'SAST (UTC+2)',
  'GMT (UTC+0)',
  'CET (UTC+1)',
  'EST (UTC-5)',
  'PST (UTC-8)',
];

const LANGUAGE_KEYS: { value: string; labelKey: StringKey }[] = [
  { value: 'English', labelKey: 'onboard.anywhere' },
  { value: 'French', labelKey: 'onboard.anywhere' },
  { value: 'Arabic', labelKey: 'onboard.anywhere' },
  { value: 'Swahili', labelKey: 'onboard.anywhere' },
  { value: 'Portuguese', labelKey: 'onboard.anywhere' },
  { value: 'Spanish', labelKey: 'onboard.anywhere' },
  { value: 'German', labelKey: 'onboard.anywhere' },
  { value: 'Mandarin', labelKey: 'onboard.anywhere' },
];

const JOB_TYPE_KEYS: { value: string; labelKey: StringKey }[] = [
  { value: 'Full-time', labelKey: 'onboard.fullTime' },
  { value: 'Part-time', labelKey: 'onboard.partTime' },
  { value: 'Contract', labelKey: 'onboard.contract' },
  { value: 'Freelance', labelKey: 'onboard.freelance' },
  { value: 'Internship', labelKey: 'onboard.internship' },
];

const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'KES',
  'NGN',
  'ZAR',
  'GHS',
  'AED',
  'INR',
  'JPY',
  'CNY',
  'BRL',
  'MXN',
  'CAD',
  'AUD',
  'CHF',
  'SGD',
  'SAR',
];

function readPlanFromQuery(): PlanId {
  if (typeof window === 'undefined') return 'starter';
  const p = new URL(window.location.href).searchParams.get('plan');
  if (p === 'starter' || p === 'pro' || p === 'managed') return p;
  return 'starter';
}

export default function Onboarding() {
  const { t } = useI18n();
  const { state, login } = useAuth();
  const subQ = useQuery({
    queryKey: ['me-subscription'],
    queryFn: fetchMeSubscription,
    enabled: state === 'authenticated',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (state !== 'authenticated') return;
    if (subQ.isLoading) return;
    if (subQ.data?.status === 'active') {
      window.location.assign('/dashboard/');
    }
  }, [state, subQ.isLoading, subQ.data?.status]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSaveWarning, setDraftSaveWarning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initialPlan = useMemo(readPlanFromQuery, []);
  const form = useForm<FormValues>({
    defaultValues: {
      cv: undefined,
      extraInfo: '',
      salaryAmount: undefined,
      salaryCurrency: 'USD',
      preferredRegions: [],
      preferredTimezones: [],
      preferredLanguages: ['English'],
      jobTypes: ['Full-time'],
      country: '',
      plan: initialPlan,
      agreeTerms: false as unknown as true,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (state === 'unauthenticated') {
      void login();
    }
  }, [state, login]);

  useEffect(() => {
    if (state !== 'authenticated') return;
    if (draftLoaded) return;
    let cancelled = false;
    (async () => {
      const draft = await fetchOnboardingDraft();
      if (cancelled) return;
      form.reset(
        { ...form.getValues(), ...(draft.fields as Record<string, unknown>) },
        { keepDirty: false, keepDefaultValues: true }
      );
      setStep(draft.step);
      setDraftLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [state, draftLoaded, form]);

  if (state === 'unauthenticated' || state === 'initializing') {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-md items-center justify-center px-4 py-16 text-center">
        <p className="text-sm text-gray-600">{t('onboard.openingSignIn')}</p>
      </div>
    );
  }

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitOnboarding({
