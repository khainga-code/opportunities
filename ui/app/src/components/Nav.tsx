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
          className={`h-4 w-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-gray-100 bg-white shadow-lg ring-1 ring-black/5">
          <div className="p-1.5">
            {browseItems.map(({ href, emoji, label, sub }) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-navy-900"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-base">
                  {emoji}
                </span>
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-gray-400">{sub}</div>
                </div>
              </a>
            ))}
          </div>
          <div className="border-t border-gray-100 px-3 py-2">
            <a
              href="/search/"
              className="flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:text-navy-900"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              </svg>
              Advanced search
            </a>
          </div>
        </div>
