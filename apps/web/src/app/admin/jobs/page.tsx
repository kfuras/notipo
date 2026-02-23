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
  result: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  post: { title: string } | null;
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

export default function JobsPage() {
  const [filter, setFilter] = useState<JobStatus | "ALL">("ALL");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const queryFilter = filter === "ALL" ? "" : `&status=${filter}`;
  const { data, loading, refetch } = useApi<{ data: JobRow[]; total: number }>(
    `/api/jobs?limit=${limit}&offset=${offset}${queryFilter}`,
  );

  useEventSource(useCallback(() => { refetch(); }, [refetch]));

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
          jobs.map((job) => (
            <div key={job.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-mono">{job.type}</span>
                <Badge variant={statusVariant[job.status] ?? "secondary"} className="shrink-0">
                  {job.status}
                </Badge>
              </div>
              {job.post && (
                <p className="text-sm truncate">{job.post.title}</p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{fmtTime(job.createdAt)}</span>
              </div>
              {job.error && (
                <p className="text-xs text-destructive">{job.error}</p>
              )}
            </div>
          ))
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
              <TableHead>Time</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No jobs
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-xs font-mono">{job.type}</TableCell>
                  <TableCell className="text-sm truncate max-w-[200px]">
                    {job.post?.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[job.status] ?? "secondary"}>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtTime(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-destructive truncate max-w-[200px]">
                    {job.error ?? ""}
                  </TableCell>
                </TableRow>
              ))
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
