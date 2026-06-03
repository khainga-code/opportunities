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
        target_job_title: '',
        experience_level: 'mid',
        job_search_status: 'actively_looking',
        salary_min: data.salaryAmount ?? undefined,
        salary_max: data.salaryAmount ?? undefined,
        currency: data.salaryCurrency ?? 'USD',
        wants_ats_report: true,
        preferred_regions: data.preferredRegions,
        preferred_timezones: data.preferredTimezones,
        preferred_languages: data.preferredLanguages,
        job_types: data.jobTypes,
        country: data.country,
        plan: data.plan,
        agree_terms: data.agreeTerms,
      });

      if (data.cv instanceof File) {
        try {
          await uploadCV(data.cv);
        } catch (cvErr) {
          console.warn('[onboarding] CV upload failed (profile saved):', cvErr);
        }
      }

      try {
        const checkout = await createCheckout({ plan_id: data.plan });
        if (checkout.status === 'redirect' && checkout.redirect_url) {
          window.location.href = checkout.redirect_url;
          return;
        }
        if (checkout.status === 'pending' && checkout.prompt_id) {
          window.location.href = `/dashboard/?billing=pending&prompt_id=${encodeURIComponent(checkout.prompt_id)}`;
          return;
        }
        if (checkout.status === 'paid') {
          window.location.href = '/dashboard/?billing=success';
          return;
        }
        throw new Error(checkout.error || 'Checkout did not complete.');
      } catch {
        window.location.href = '/dashboard/?billing=failed';
        return;
      }
    } catch (e) {
      setSubmitError(e instanceof Error && e.message ? e.message : t('error.somethingWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  function validateStep(s: 1 | 2 | 3): boolean {
    const values = form.getValues();
    const schemas: Record<number, z.ZodTypeAny> = {
      1: Step1Schema,
      2: Step2Schema,
      3: Step3Schema,
    };
    const parsed = schemas[s]!.safeParse(values);
    if (parsed.success) return true;

    const msgMap: Record<string, StringKey> = {
      extraInfo: 'onboard.validationCVOrInfo',
      cv: 'onboard.validationCV',
      preferredRegions: 'onboard.validationRegion',
      country: 'onboard.validationCountry',
      preferredLanguages: 'onboard.validationLanguage',
      jobTypes: 'onboard.validationJobType',
      agreeTerms: 'onboard.validationTerms',
    };
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FormValues;
      const key = msgMap[field as string];
      form.setError(field, { message: key ? t(key) : issue.message });
    }
    return false;
  }

  async function next() {
    if (!validateStep(step)) return;
    if (step < 3) {
      const nextStep = (step + 1) as 1 | 2 | 3;
      const values = form.getValues();
      const fieldsForServer: OnboardingDraftFields = {
        target_job_title: '',
        experience_level: 'mid',
        job_search_status: 'actively_looking',
        salary_range: values.salaryAmount
          ? `${values.salaryCurrency ?? 'USD'} ${values.salaryAmount}`
          : undefined,
        wants_ats_report: true,
        preferred_regions: values.preferredRegions,
        preferred_timezones: values.preferredTimezones,
        preferred_languages: values.preferredLanguages,
        job_types: values.jobTypes,
        country: values.country,
        plan: values.plan,
      };
      try {
        await saveOnboardingDraft(nextStep, fieldsForServer);
        setDraftSaveWarning(false);
      } catch {
        setDraftSaveWarning(true);
      }
      setStep(nextStep);
    } else await form.handleSubmit(onSubmit)();
  }

  const selectedPlan = form.watch('plan');
  const finishLabel =
    step === 3
      ? `${t('onboard.continueToPayment')} · $${planById(selectedPlan).price}${t('dash.perMonth')}`
      : t('onboard.continue');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {draftSaveWarning && (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          {t('onboard.draftSaveWarning')}
        </div>
      )}
      <Progress step={step} t={t} />
      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {step === 1 && <Step1Form form={form} t={t} />}
        {step === 2 && <Step2Form form={form} t={t} />}
        {step === 3 && <Step3Form form={form} t={t} />}
        {submitError && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {submitError}
          </p>
        )}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 1 || submitting}
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
          >
            {t('onboard.back')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-navy-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-900 disabled:opacity-60"
          >
            {submitting ? t('onboard.submitting') : finishLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

type T = (k: StringKey, fallback?: string) => string;

function Progress({ step, t }: { step: 1 | 2 | 3; t: T }) {
  return (
    <div
      role="progressbar"
      aria-label="Onboarding progress"
      aria-valuemin={1}
      aria-valuemax={3}
      aria-valuenow={step}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {t('onboard.step')} {step} {t('onboard.of')} 3 · {t(STEP_LABEL_KEYS[step - 1]!)}
      </p>
      <ol className="mt-3 grid grid-cols-3 gap-2" aria-hidden>
        {STEP_LABEL_KEYS.map((key, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = step > n;
          const active = step === n;
          return (
            <li key={key} className="flex flex-col gap-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  done || active ? 'bg-accent-500' : 'bg-gray-200'
                }`}
              />
              <span className={`text-xs ${active ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                {t(key)}
              </span>
            </li>
