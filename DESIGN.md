# DESIGN.md — Hotel Lead Gen

Visual system for the web app (`web/`). Tailwind v4 + CSS variables in
`web/app/globals.css`; Geist Sans/Mono via `next/font`. Light + dark, driven by
`prefers-color-scheme` and Tailwind `dark:` variants. Same system as the
sibling Longhorn Houses Leads app — operator-grade, near-neutral, color only
for meaning.

## Theme

Zinc greys carry the UI; color is reserved for meaning (never decoration).
Surfaces are flat with hairline borders — no gradients, no glass, no
drop-shadow stacks. One elevation for the hotel detail modal only.

## Color

Semantic, not decorative. Same color always means the same thing.

| Token | Light | Dark | Meaning |
|-------|-------|------|---------|
| background | `#ffffff` | `#0a0a0a` | page |
| foreground | `#171717` | `#ededed` | primary ink / inverted button fills |
| surface | `zinc-50` | `zinc-900` | inset section boxes |
| border | `zinc-200` | `zinc-800` | hairlines |
| muted ink | `zinc-500` | `zinc-400` | secondary text (min for body-weight) |
| **red** | 500/600 | 300 | hot lead (score ≥70), distress, stopped filing, below-benchmark |
| **amber** | 500/600 | 300 | warm lead (50–69), declining trend, soft warnings |
| **emerald** | 500/600 | 400 | above benchmark, healthy, "at market" |
| **blue** | 500/600 | 300/400 | informational: benchmark lines, comp-set context |
| **violet** | 500/600 | 300/400 | owner/enrichment intel (DCAD, later skip-trace) |

Rules: never gray text on a colored fill (use a shade of that hue). Muted text
floors at `zinc-500` (light) / `zinc-400` (dark) for anything body-weight.
Score chips: red fill ≥70, amber 50–69, zinc <50 — everywhere a score appears.

## Typography

- **Geist Sans** — everything. **Geist Mono** reserved; use `tabular-nums` for
  aligned figures rather than swapping family.
- Scale: `text-2xl` page titles, `text-xl` hotel name headline, `text-[15px]`
  card/primary, `text-[13px]` body/rows, `text-[11px]`–`text-[12px]` captions
  and uppercase labels (with `tracking-wider`).
- `tabular-nums` on all money/RevPAR/counts so columns align.

## Components

- **Section box**: `rounded-lg bg-zinc-50 dark:bg-zinc-900 p-4`. One level only.
- **Badge**: pill, `rounded-full`, tone-mapped to the semantic palette
  ("underperforming" red, "independent" zinc, "stopped filing" red,
  "above market" emerald).
- **Hotel row**: hairline-bordered row, hover raises border; whole row is the
  click target; badges capped at 3 + overflow.
- **Hotel detail modal**: the one elevated surface — centered, portal to
  `document.body`, scrollable body; charts before prose.
- **Charts (recharts)**: benchmark median is always a blue reference line;
  the hotel's series is foreground ink; below-benchmark fills red at 40%
  opacity. Axis/grid hairlines use the border token. No chart junk.
- **Buttons**: neutral outline for secondary, inverted fill
  (`bg-foreground text-background`) for primary page actions (Export CSV).

## Layout

- App shell: collapsible left nav rail (`w-64` ↔ 0, cookie-persisted) + slim
  sticky header; content `max-w-6xl`.
- Flexbox for rows, grid only for true 2D. `gap` for spacing, not per-child margin.
- Wide content scrolls inside its own container; the page body never scrolls
  sideways.

## Motion

- Entrances: `ease-out` exponential curves, 150–300ms. No bounce/elastic.
- `.animate-fade-up` for page/section arrival; modal scale-fade on open.
- Every animation has a `prefers-reduced-motion: reduce` fallback (instant).
