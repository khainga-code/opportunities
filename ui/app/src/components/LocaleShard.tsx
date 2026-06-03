import { useEffect, useMemo } from "react";
import Cascade from "./Cascade";
import { useCandidateProfile } from "@/hooks/useCandidateProfile";
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Cascade from './Cascade';
import { useAuth } from '@/providers/AuthProvider';
import { fetchCandidate } from '@/api/candidates';
import { useI18n } from '@/i18n/I18nProvider';

export default function LocaleShard() {
  const mount = useMemo(() => document.getElementById('mount-locale-shard'), []);
  const country = (mount?.getAttribute('data-locale-country') ?? '').toUpperCase();
  const langsCSV = mount?.getAttribute('data-locale-languages') ?? '';

  const languages = useMemo(
    () =>
      langsCSV
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
