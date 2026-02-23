"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  wpSiteUrl: string | null;
  notionDatabaseId: string | null;
  codeHighlighter: string;
  createdAt: string;
  _count: { users: number; posts: number };
}

interface CreateResult {
  data: {
    id: string;
    name: string;
    slug: string;
    users: Array<{ email: string; apiKey: string }>;
  };
}

export default function TenantsPage() {
  const { apiKey } = useAuth();
  const { data, refetch } = useApi<{ data: TenantRow[] }>("/api/admin/tenants");
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const tenants = data?.data ?? [];

  async function deleteTenant(id: string, name: string) {
    if (!confirm(`Delete tenant "${name}"? This cannot be undone.`)) return;
    await api(`/api/admin/tenants/${id}`, { method: "DELETE", apiKey: apiKey! });
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCreatedKey(null); }}>
          <DialogTrigger asChild>
            <Button size="sm">Create Tenant</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Tenant</DialogTitle>
            </DialogHeader>
            {createdKey ? (
              <CreatedKeyDisplay apiKey={createdKey} onClose={() => { setOpen(false); setCreatedKey(null); }} />
            ) : (
              <CreateTenantForm
                apiKey={apiKey!}
                onCreated={(key) => { setCreatedKey(key); refetch(); }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {tenants.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">No tenants</p>
        ) : (
          tenants.map((t) => (
            <div key={t.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.slug}</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteTenant(t.id, t.name)}
                >
                  Delete
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t._count.posts} posts</span>
                <span className="text-muted-foreground">{t._count.users} users</span>
                <Badge variant={t.wpSiteUrl ? "default" : "secondary"}>
                  WP: {t.wpSiteUrl ? "Yes" : "No"}
                </Badge>
                <Badge variant={t.notionDatabaseId ? "default" : "secondary"}>
                  Notion: {t.notionDatabaseId ? "Yes" : "No"}
                </Badge>
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
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>WordPress</TableHead>
              <TableHead>Notion</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No tenants
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.slug}</TableCell>
                  <TableCell>{t._count.posts}</TableCell>
                  <TableCell>{t._count.users}</TableCell>
                  <TableCell>
                    <Badge variant={t.wpSiteUrl ? "default" : "secondary"}>
                      {t.wpSiteUrl ? "Connected" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.notionDatabaseId ? "default" : "secondary"}>
                      {t.notionDatabaseId ? "Connected" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteTenant(t.id, t.name)}
                    >
                      Delete
                    </Button>
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

function CreateTenantForm({
  apiKey,
  onCreated,
}: {
  apiKey: string;
  onCreated: (apiKey: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<CreateResult>("/api/admin/tenants", {
        method: "POST",
        apiKey,
        body: { name, slug, ownerEmail: email },
      });
      const key = res.data.users[0]?.apiKey;
      if (key) onCreated(key);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Slug</Label>
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="my-blog"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Owner Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Creating..." : "Create"}
      </Button>
    </form>
  );
}

function CreatedKeyDisplay({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tenant created. Copy the API key now — it won't be shown again.
      </p>
      <div className="flex gap-2">
        <Input value={apiKey} readOnly className="font-mono text-xs" />
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <Button onClick={onClose} className="w-full">Done</Button>
    </div>
  );
}
