"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import { useEventSource } from "@/hooks/use-event-source";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiPost, ApiJob, ApiListResponse } from "@notipo/shared";

interface SettingsData {
  data: {
    notion: { configured: boolean; databaseId: string | null };
    wordpress: { configured: boolean };
  };
}

interface JobUpdateEvent {
  jobId: string;
  type: string;
  status: string;
  step?: string;
  postId?: string;
  notionPageId?: string;
}

interface LiveJob {
  jobId: string;
  type: string;
  status: string;
  steps: string[];
  postId?: string;
  notionPageId?: string;
}

export default function DashboardPage() {
  const { apiKey } = useAuth();
  const { data: postsData, refetch: refetchPosts } = useApi<ApiListResponse<ApiPost>>("/api/posts");
  const { data: jobsData, refetch: refetchJobs } = useApi<{ data: ApiJob[]; total: number }>(
    "/api/jobs?limit=5",
  );
  const { data: settings } = useApi<SettingsData>("/api/settings");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [liveJobs, setLiveJobs] = useState<Map<string, LiveJob>>(new Map());

  const onEvent = useCallback((_event: string, data: unknown) => {
    const payload = data as JobUpdateEvent;
    if (!payload?.jobId) {
      refetchJobs();
      refetchPosts();
      return;
    }

    if (payload.status === "RUNNING") {
      setLiveJobs((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.jobId);
        const steps = existing?.steps ? [...existing.steps] : [];
        if (payload.step && !steps.includes(payload.step)) {
          steps.push(payload.step);
        }
        next.set(payload.jobId, {
          jobId: payload.jobId,
          type: payload.type,
          status: payload.status,
          steps,
          postId: payload.postId,
          notionPageId: payload.notionPageId,
        });
        return next;
      });
    } else {
      // Job finished — remove from live tracking
      setLiveJobs((prev) => {
        const next = new Map(prev);
        next.delete(payload.jobId);
        return next;
      });
      refetchJobs();
      refetchPosts();
    }
  }, [refetchJobs, refetchPosts]);

  useEventSource(onEvent);

  const posts = postsData?.data ?? [];
  const jobs = jobsData?.data ?? [];
  const notion = settings?.data?.notion;
  const wordpress = settings?.data?.wordpress;

  const stats = {
    total: posts.length,
    published: posts.filter((p) => p.status === "PUBLISHED").length,
    synced: posts.filter((p) => p.status === "SYNCED").length,
    failed: posts.filter((p) => p.status === "FAILED").length,
  };

  const needsSetup = settings && (!notion?.configured || !wordpress?.configured);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await api("/api/sync-now", { method: "POST", apiKey: apiKey ?? undefined });
    } catch (err) {
      setSyncError(err instanceof ApiError ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const jobTypeLabel = (type: string) => {
    switch (type) {
      case "SYNC_POST": return "Sync";
      case "PUBLISH_POST": return "Publish";
      default: return type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {needsSetup && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Get Started</CardTitle>
            <CardDescription>
              Connect your services to start publishing from Notion to WordPress.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              <SetupStep
                number={1}
                title="Connect Notion"
                done={!!notion?.configured}
                href="/admin/settings"
              />
              <SetupStep
                number={2}
                title="Connect WordPress"
                done={!!wordpress?.configured}
                href="/admin/settings"
              />
              <SetupStep
                number={3}
                title="Set up your Notion database"
                done={!!notion?.databaseId}
                href="https://free-dentist-6b2.notion.site/30d842af972f8091a104eb8773fbf390?v=30d842af972f803dab87000cdbd5d9b6"
                external
              />
            </ol>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Posts" value={stats.total} />
        <StatCard title="Published" value={stats.published} />
        <StatCard title="Synced" value={stats.synced} />
        <StatCard title="Failed" value={stats.failed} />
      </div>

      {/* Recent Posts — Notion-like property cards */}
      {posts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Posts</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/posts">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {posts.slice(0, 4).map((post) => (
                <PostPropertyCard key={post.id} post={post} liveJobs={liveJobs} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Connections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notion</span>
              <Badge variant={notion?.configured ? "default" : "secondary"}>
                {notion?.configured ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">WordPress</span>
              <Badge variant={wordpress?.configured ? "default" : "secondary"}>
                {wordpress?.configured ? "Connected" : "Not connected"}
              </Badge>
            </div>
            {notion?.configured && (
              <div className="pt-2">
                <Button
                  size="sm"
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                  disabled={syncing || liveJobs.size > 0}
                  onClick={handleSyncNow}
                >
                  {syncing
                    ? "Starting sync..."
                    : liveJobs.size > 0
                      ? (() => {
                          const latest = Array.from(liveJobs.values()).pop();
                          const step = latest?.steps[latest.steps.length - 1];
                          return step ?? "Syncing...";
                        })()
                      : "Sync Now"}
                </Button>
                {syncError && (
                  <p className="text-xs text-destructive mt-1">{syncError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Live running jobs with step progress */}
            {Array.from(liveJobs.values()).map((lj) => (
              <div key={lj.jobId} className="mb-4 pb-4 border-b border-border last:border-0">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                    </span>
                    <span className="text-sm font-medium">{jobTypeLabel(lj.type)} Job</span>
                  </div>
                  <Badge variant="outline" className="text-xs text-violet-400 border-violet-500/30">Running</Badge>
                </div>
                <div className="space-y-1.5 ml-4">
                  {lj.steps.map((step) => (
                    <div key={step} className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span className="text-xs text-muted-foreground">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Completed/failed jobs from API */}
            {jobs.length === 0 && liveJobs.size === 0 ? (
              <p className="text-sm text-muted-foreground">No recent jobs</p>
            ) : (
              <div className="space-y-2">
                {jobs.filter((j) => !liveJobs.has(j.id)).slice(0, liveJobs.size > 0 ? 3 : 5).map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 truncate mr-2">
                      {job.status === "COMPLETED" && (
                        <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                          <svg className="w-2.5 h-2.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      )}
                      {job.status === "FAILED" && (
                        <div className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                          <svg className="w-2.5 h-2.5 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </div>
                      )}
                      {job.status !== "COMPLETED" && job.status !== "FAILED" && (
                        <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                        </div>
                      )}
                      <span className="truncate">{jobTypeLabel(job.type)}</span>
                    </div>
                    <Badge
                      variant={
                        job.status === "COMPLETED"
                          ? "default"
                          : job.status === "FAILED"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-xs shrink-0"
                    >
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const postStatusStyle: Record<string, string> = {
  PUBLISHED: "bg-green-500/15 text-green-500",
  SYNCED: "bg-blue-500/15 text-blue-400",
  FAILED: "bg-red-500/15 text-red-400",
  IMAGES_PROCESSING: "bg-yellow-500/15 text-yellow-400",
  PUBLISHING: "bg-violet-500/15 text-violet-400",
  UPDATE_PENDING: "bg-orange-500/15 text-orange-400",
};

function PostPropertyCard({ post, liveJobs }: { post: ApiPost; liveJobs: Map<string, LiveJob> }) {
  // Check if a live job is running for this post
  const liveJob = Array.from(liveJobs.values()).find(
    (lj) => lj.notionPageId === post.notionPageId || lj.postId === post.id,
  );
  const liveStatus = liveJob
    ? liveJob.type === "PUBLISH_POST" ? "Publishing" : "Syncing"
    : null;

  return (
    <div className="rounded-xl border bg-card p-4 md:p-5">
      {/* Title header */}
      <div className="flex items-center gap-2 mb-3 pb-2.5 border-b">
        <div className="w-5 h-5 rounded bg-violet-500/15 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
        </div>
        <span className="text-sm font-medium truncate">{post.title}</span>
      </div>

      {/* Property rows — matches landing page mockup layout */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status</span>
          {liveStatus ? (
            <span className="text-xs font-medium rounded-md px-3 py-0.5 bg-violet-500/15 text-violet-400 flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
              </span>
              {liveStatus}
            </span>
          ) : (
            <span className={`text-xs font-medium rounded-md px-3 py-0.5 ${postStatusStyle[post.status] ?? "bg-muted text-muted-foreground"}`}>
              {post.status === "IMAGES_PROCESSING" ? "Processing" : post.status === "UPDATE_PENDING" ? "Updating" : post.status.charAt(0) + post.status.slice(1).toLowerCase()}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Category</span>
          <span className="text-xs text-foreground/70 bg-muted px-3 py-0.5 rounded-md">
            {post.category?.name ?? "Uncategorized"}
          </span>
        </div>
        {post.wpUrl && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">WordPress</span>
            <a
              href={post.wpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-violet-400 hover:underline truncate max-w-[180px]"
            >
              {post.wpUrl.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SetupStep({
  number,
  title,
  done,
  href,
  external,
}: {
  number: number;
  title: string;
  done: boolean;
  href: string;
  external?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? "bg-primary text-primary-foreground"
            : "border border-muted-foreground text-muted-foreground"
        }`}
      >
        {done ? "\u2713" : number}
      </span>
      <span className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>
        {title}
      </span>
      {!done && (
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          {external ? (
            <a href={href} target="_blank" rel="noopener noreferrer">Set up</a>
          ) : (
            <Link href={href}>Set up</Link>
          )}
        </Button>
      )}
    </li>
  );
}
