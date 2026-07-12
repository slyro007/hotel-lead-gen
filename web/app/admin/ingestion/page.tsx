import { getDataFreshness, listRuns } from "../../../db/queries/ingestion";
import { requireApproved } from "../../../lib/auth";
import { fmtInt, fmtQuarter } from "../../../lib/format";
import { EmptyState, NotApproved } from "../../_components/not-approved";
import { Badge } from "../../_components/score-chip";

export const dynamic = "force-dynamic";

export default async function IngestionPage() {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const [runs, freshness] = await Promise.all([listRuns(), getDataFreshness()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-fade-up">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ingestion</h1>
        {freshness ? (
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Data through {fmtQuarter(freshness.year, freshness.quarter)}
          </span>
        ) : (
          <Badge tone="amber">no filings ingested</Badge>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No pipeline runs recorded"
            hint="Every pipeline stage writes a row here. See CLAUDE.md for the run order."
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 [&>th]:py-2 [&>th]:pr-3">
                <th>Started</th>
                <th>Stage</th>
                <th>Status</th>
                <th className="text-right">Processed</th>
                <th className="text-right">Inserted</th>
                <th className="text-right">Updated</th>
                <th className="text-right">Skipped</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-zinc-100 dark:border-zinc-900 [&>td]:py-2 [&>td]:pr-3"
                >
                  <td className="whitespace-nowrap tabular-nums text-zinc-500 dark:text-zinc-400">
                    {r.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="font-medium">{r.stage}</td>
                  <td>
                    <Badge
                      tone={
                        r.status === "success" ? "emerald" : r.status === "failed" ? "red" : "amber"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="text-right tabular-nums">{fmtInt(r.rowsProcessed)}</td>
                  <td className="text-right tabular-nums">{fmtInt(r.rowsInserted)}</td>
                  <td className="text-right tabular-nums">{fmtInt(r.rowsUpdated)}</td>
                  <td className="text-right tabular-nums">{fmtInt(r.rowsSkipped)}</td>
                  <td className="max-w-64 truncate text-zinc-500 dark:text-zinc-400">
                    {r.notes ?? r.sourceFile ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
