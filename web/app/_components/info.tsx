"use client";

import { useId, useState } from "react";
import { glossary } from "../../lib/glossary";

/**
 * Small "?" affordance that reveals a plain-language definition of a glossary
 * term on hover or keyboard focus. Accessible: it's a real button, the panel is
 * linked via aria-describedby, and Escape closes it. One elevation, hairline
 * border (DESIGN.md).
 */
export function InfoTip({ term, label }: { term: string; label?: string }) {
  const entry = glossary(term);
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!entry) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`What is ${label ?? entry.term}?`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink-muted/50 text-[9px] font-semibold leading-none text-ink-muted transition-colors hover:border-foreground hover:text-foreground"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-5 z-[2100] w-64 -translate-x-1/2 rounded-lg border border-border bg-background p-3 text-left text-[12px] font-normal leading-snug text-foreground shadow-[var(--shadow-overlay)]"
        >
          <span className="mb-1 block font-semibold">{entry.term}</span>
          <span className="block text-ink-muted">{entry.plain}</span>
        </span>
      )}
    </span>
  );
}

/**
 * A label paired with its InfoTip — use anywhere a jargon term is a heading or
 * column so the "?" sits right next to the word.
 */
export function TermLabel({
  term,
  children,
  className,
}: {
  term: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {children}
      <InfoTip term={term} label={typeof children === "string" ? children : undefined} />
    </span>
  );
}
