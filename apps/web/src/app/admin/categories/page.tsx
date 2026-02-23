"use client";

import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import type { ApiCategory, ApiTag, ApiListResponse } from "@notipo/shared";

export default function CategoriesPage() {
  const { apiKey } = useAuth();
  const { data: catData, loading, refetch } = useApi<ApiListResponse<ApiCategory>>("/api/categories");
  const { data: tagData } = useApi<ApiListResponse<ApiTag>>("/api/tags");
  const [syncing, setSyncing] = useState(false);

  const categories = catData?.data ?? [];
  const tags = tagData?.data ?? [];

  async function syncFromWP() {
    if (!apiKey) return;
    setSyncing(true);
    try {
      await api("/api/categories/sync", { method: "POST", apiKey });
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories & Tags</h1>
        <Button variant="outline" size="sm" onClick={syncFromWP} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync from WordPress"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Imported automatically from WordPress. New entries are picked up every 5 minutes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold mb-2">Categories</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>WP ID</TableHead>
                  <TableHead>Background</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No categories
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {cat.wpCategoryId ?? "—"}
                      </TableCell>
                      <TableCell>
                        {cat.backgroundImage ? (
                          <Badge variant="secondary">Set</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2">Tags</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>WP ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No tags
                    </TableCell>
                  </TableRow>
                ) : (
                  tags.map((tag) => (
                    <TableRow key={tag.id}>
                      <TableCell className="font-medium">{tag.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {tag.wpTagId ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
