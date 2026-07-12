import clsx from "clsx";
import { SCORE_BAND_CLASS, SCORE_BAND_LABEL, scoreBand } from "../../lib/score-labels";

export function ScoreChip({ score, showLabel = false }: { score: number | null; showLabel?: boolean }) {
  const band = scoreBand(score);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        SCORE_BAND_CLASS[band]
      )}
    >
      {score ?? "—"}
      {showLabel && <span className="font-normal">{SCORE_BAND_LABEL[band]}</span>}
    </span>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "red" | "amber" | "emerald" | "zinc" | "violet" | "blue";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
  };
  return (
    <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}
