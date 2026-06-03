import { useState, useRef, useEffect } from "react";
import { StawiAuth } from "./StawiAuth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { StawiAuth } from './StawiAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useI18n } from '@/i18n/I18nProvider';

const browseItems = [
  { href: "/jobs/",         emoji: "💼", label: "Jobs",         sub: "Full-time, remote & more" },
  { href: "/scholarships/", emoji: "🎓", label: "Scholarships", sub: "Grants & bursaries" },
  { href: "/tenders/",      emoji: "📋", label: "Tenders",      sub: "RFPs & procurement" },
  { href: "/deals/",        emoji: "🏷️", label: "Deals",        sub: "Curated discounts" },
  { href: "/funding/",      emoji: "💰", label: "Funding",      sub: "Grants & investment" },
];

function BrowseDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-navy-900"
      >
        Browse
        <svg
