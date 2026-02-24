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

export default function DashboardPage() {
  const { apiKey } = useAuth();
  const { data: postsData, refetch: refetchPosts } = useApi<ApiListResponse<ApiPost>>("/api/posts");
  const { data: jobsData, refetch: refetchJobs } = useApi<{ data: ApiJob[]; total: number }>(
    "/api/jobs?limit=5",
  );
  const { data: settings } = useApi<SettingsData>("/api/settings");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const onEvent = useCallback(() => {
    refetchJobs();
    refetchPosts();
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
                  variant="outline"
                  className="w-full"
                  disabled={syncing}
                  onClick={handleSyncNow}
                >
                  {syncing ? "Syncing..." : "Sync Now"}
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
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent jobs</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex justify-between text-sm"
                  >
                    <span className="truncate mr-2">{job.type}</span>
                    <Badge
                      variant={
                        job.status === "COMPLETED"
                          ? "default"
                          : job.status === "FAILED"
                            ? "destructive"
                            : "secondary"
                      }
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
