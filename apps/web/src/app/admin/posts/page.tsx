"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
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
import type { ApiPost, ApiListResponse, PostStatus } from "@notipo/shared";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PUBLISHED: "default",
  SYNCED: "secondary",
  FAILED: "destructive",
  IMAGES_PROCESSING: "outline",
  PUBLISHING: "outline",
  UPDATE_PENDING: "outline",
};

const filters: Array<{ label: string; value: PostStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Synced", value: "SYNCED" },
  { label: "Failed", value: "FAILED" },
];

export default function PostsPage() {
  const [filter, setFilter] = useState<PostStatus | "ALL">("ALL");
  const { data, loading } = useApi<ApiListResponse<ApiPost>>("/api/posts");

  const posts = (data?.data ?? []).filter(
    (p) => filter === "ALL" || p.status === filter,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Posts</h1>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <p className="text-center text-muted-foreground py-4">Loading...</p>
        ) : posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">No posts</p>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm leading-snug">{post.title}</p>
                <Badge variant={statusVariant[post.status] ?? "secondary"} className="shrink-0">
                  {post.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{post.category?.name ?? "No category"}</span>
                {post.wpUrl && (
                  <a href={post.wpUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    View on WP
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>WP Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No posts
                </TableCell>
              </TableRow>
            ) : (
              posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium">{post.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {post.category?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[post.status] ?? "secondary"}>
                      {post.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {post.wpUrl ? (
                      <a
                        href={post.wpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
