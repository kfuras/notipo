"use client";

import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ApiPost, ApiJob, ApiListResponse } from "@notipo/shared";

export default function DashboardPage() {
  const { data: postsData } = useApi<ApiListResponse<ApiPost>>("/api/posts");
  const { data: jobsData } = useApi<{ data: ApiJob[]; total: number }>(
    "/api/jobs?limit=5",
  );
  const { data: settings } = useApi<{ data: Record<string, unknown> }>(
    "/api/settings",
  );

  const posts = postsData?.data ?? [];
  const jobs = jobsData?.data ?? [];
  const cfg = (settings?.data ?? {}) as Record<string, unknown>;

  const stats = {
    total: posts.length,
    published: posts.filter((p) => p.status === "PUBLISHED").length,
    synced: posts.filter((p) => p.status === "SYNCED").length,
    failed: posts.filter((p) => p.status === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

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
              <Badge variant={cfg.notionConnected ? "default" : "secondary"}>
                {cfg.notionConnected ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">WordPress</span>
              <Badge variant={cfg.wordpressConnected ? "default" : "secondary"}>
                {cfg.wordpressConnected ? "Connected" : "Not connected"}
              </Badge>
            </div>
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
