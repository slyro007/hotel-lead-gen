// UI thresholds for the lead score and RevPAR index. The formulas that
// produce these numbers live in pipeline/score.py — this file only decides how
// they read on screen (DESIGN.md: red = hot, amber = warm, zinc = watch).

export type ScoreBand = "hot" | "warm" | "watch";

export function scoreBand(score: number | null): ScoreBand {
  if (score == null) return "watch";
  if (score >= 70) return "hot";
  if (score >= 50) return "warm";
  return "watch";
}

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  hot: "Hot",
  warm: "Warm",
  watch: "Watch",
};

// Chip classes per band — same color always means the same thing.
export const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  hot: "bg-red-600 text-white dark:bg-red-500",
  warm: "bg-amber-500 text-white dark:bg-amber-400 dark:text-zinc-950",
  watch: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export const UNDERPERFORMING_INDEX = 75; // RevPAR index below this wears the badge

export function isUnderperforming(index: number | null): boolean {
  return index != null && index < UNDERPERFORMING_INDEX;
}
