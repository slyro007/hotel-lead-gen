"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TocEntry {
  id: string;
  label: string;
}

/**
 * Centered "dossier" modal for the intercepted hotel detail. Rendered through a
 * portal to document.body so it escapes the explorer's stacking context and
 * paints above the Leaflet map (whose panes/controls sit at z-index 1000). A
 * left table-of-contents scroll-spies the sections on the right: the active
 * marker glides as you scroll, clicking an entry smooth-scrolls to it. Closes
 * via backdrop / × / Esc — all through router.back() so the URL returns to
 * /hotels and the panel slot unmounts.
 */
export function PanelShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });

  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Esc-to-close + background scroll lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  // Build the TOC from the sections the detail rendered, and scroll-spy them.
  // Gated on `mounted` because the portal (and scrollRef) only exist after the
  // first effect flips it true.
  useEffect(() => {
    const root = scrollRef.current;
    if (!mounted || !root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-toc]"));
    setToc(els.map((el) => ({ id: el.id, label: el.dataset.toc || el.id })));
    setActiveId(els[0]?.id ?? null);

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId((visible[0].target as HTMLElement).id);
      },
      { root, rootMargin: "-12% 0px -60% 0px", threshold: 0 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [mounted]);

  // Slide the active-section indicator to the current item.
  useEffect(() => {
    if (!activeId) return;
    const el = itemRefs.current[activeId];
    if (el) setIndicator({ top: el.offsetTop, height: el.offsetHeight });
  }, [activeId, toc]);

  const goTo = useCallback((id: string) => {
    const root = scrollRef.current;
    const el = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!root || !el) return;
    // Scroll the container itself (not scrollIntoView, which can retarget the
    // wrong ancestor and fights the scroll-spy observer). Offset = the section's
    // position relative to the current scroll viewport, minus breathing room.
    // Instant, not smooth: React re-renders reliably cancel an in-flight smooth
    // scroll here. The scroll-spy still animates the active marker on manual scroll.
    const top = root.scrollTop + (el.getBoundingClientRect().top - root.getBoundingClientRect().top) - 12;
    root.scrollTo({ top, behavior: "auto" });
    setActiveId(id);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] grid place-items-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={close}
        className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm"
      />

      <div className="animate-modal-in relative flex h-[min(90vh,940px)] w-[min(1080px,96vw)] overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-overlay)]">
        {/* Left: table of contents rail */}
        <nav className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface/60 p-3 md:flex">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            This hotel
          </p>
          <div className="relative">
            <span
              aria-hidden="true"
              className="absolute left-0 w-0.5 rounded-full bg-foreground transition-all duration-300 ease-out"
              style={{ top: indicator.top, height: indicator.height }}
            />
            <ul className="space-y-0.5">
              {toc.map((s) => (
                <li key={s.id}>
                  <button
                    ref={(el) => {
                      itemRefs.current[s.id] = el;
                    }}
                    onClick={() => goTo(s.id)}
                    className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                      activeId === s.id
                        ? "font-medium text-foreground"
                        : "text-ink-muted hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Right: persistent header + scroll body */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
            <span className="truncate text-[13px] font-semibold">{title}</span>
            <button
              aria-label="Close"
              onClick={close}
              className="shrink-0 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-black dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
