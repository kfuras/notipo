"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { useEventSource } from "@/hooks/use-event-source";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobStatus } from "@notipo/shared";

interface JobRow {
  id: string;
  type: string;
  status: string;
  postId: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  post: { title: string } | null;
}

interface JobUpdateEvent {
  jobId: string;
  type: string;
  status: string;
  step?: string;
}

interface LiveStep {
  steps: string[];
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETED: "default",
  RUNNING: "outline",
  PENDING: "secondary",
  FAILED: "destructive",
  CANCELLED: "secondary",
};

const filters: Array<{ label: string; value: JobStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Running", value: "RUNNING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "FAILED" },
];

function jobTypeLabel(type: string) {
  switch (type) {
    case "SYNC_POST": return "Sync";
    case "PUBLISH_POST": return "Publish";
    case "NOTION_POLL": return "Poll";
    default: return type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

export default function JobsPage() {
  const [filter, setFilter] = useState<JobStatus | "ALL">("ALL");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const [liveSteps, setLiveSteps] = useState<Map<string, LiveStep>>(new Map());

  const queryFilter = filter === "ALL" ? "" : `&status=${filter}`;
  const { data, loading, refetch } = useApi<{ data: JobRow[]; total: number }>(
    `/api/jobs?limit=${limit}&offset=${offset}${queryFilter}`,
  );

  const onEvent = useCallback((_event: string, eventData: unknown) => {
    const payload = eventData as JobUpdateEvent;
    if (payload?.jobId && payload.status === "RUNNING" && payload.step) {
      setLiveSteps((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.jobId);
        const steps = existing?.steps ? [...existing.steps] : [];
        if (!steps.includes(payload.step!)) {
          steps.push(payload.step!);
        }
        next.set(payload.jobId, { steps });
        return next;
      });
    } else if (payload?.jobId && payload.status !== "RUNNING") {
      setLiveSteps((prev) => {
        const next = new Map(prev);
        next.delete(payload.jobId);
        return next;
      });
    }
    refetch();
  }, [refetch]);

  useEventSource(onEvent);

  const jobs = data?.data ?? [];
  const total = data?.total ?? 0;

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getJobStep(job: JobRow): string | null {
    // Live step from SSE
    const live = liveSteps.get(job.id);
    if (live?.steps.length) return live.steps[live.steps.length - 1];
    // Persisted step from API result
    if (job.status === "RUNNING" && job.result && typeof job.result === "object" && "step" in job.result) {
      return job.result.step as string;
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Jobs</h1>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setFilter(f.value);
              setOffset(0);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <p className="text-center text-muted-foreground py-4">Loading...</p>
        ) : jobs.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">No jobs</p>
        ) : (
          jobs.map((job) => {
            const step = getJobStep(job);
            const live = liveSteps.get(job.id);
            return (
              <div key={job.id} className="rounded-md border p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {job.status === "RUNNING" && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                      </span>
                    )}
                    <span className="text-xs font-medium">{jobTypeLabel(job.type)}</span>
                  </div>
                  <Badge variant={statusVariant[job.status] ?? "secondary"} className={`shrink-0 ${job.status === "RUNNING" ? "text-violet-400 border-violet-500/30" : ""}`}>
                    {job.status}
                  </Badge>
                </div>
                {job.post && (
                  <p className="text-sm truncate">{job.post.title}</p>
                )}
                {/* Live steps */}
                {job.status === "RUNNING" && live && live.steps.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {live.steps.map((s) => (
                      <div key={s} className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-violet-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span className="text-xs text-muted-foreground">{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Fallback: single step from API */}
                {job.status === "RUNNING" && !live && step && (
                  <p className="text-xs text-violet-400">{step}</p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{fmtTime(job.createdAt)}</span>
                </div>
                {job.error && (
                  <p className="text-xs text-destructive">{job.error}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No jobs
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const step = getJobStep(job);
                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {job.status === "RUNNING" && (
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                          </span>
                        )}
                        <span className="text-xs font-medium">{jobTypeLabel(job.type)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">
                      {job.post?.title ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[job.status] ?? "secondary"} className={job.status === "RUNNING" ? "text-violet-400 border-violet-500/30" : ""}>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {step ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtTime(job.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-destructive truncate max-w-[200px]">
                      {job.error ?? ""}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {total > limit && (
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
