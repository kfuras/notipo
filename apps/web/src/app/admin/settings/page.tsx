"use client";

import { useState } from "react";
import { useApi, useApiCall } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface SettingsData {
  data: {
    notion: {
      configured: boolean;
      authMode: string;
      oauthAvailable: boolean;
      workspaceId: string | null;
      databaseId: string | null;
      triggerStatus: string | null;
      publishTriggerStatus: string | null;
      updateTriggerStatus: string | null;
    };
    wordpress: {
      configured: boolean;
      siteUrl: string | null;
    };
    codeHighlighter: string;
  };
}

export default function SettingsPage() {
  const { data: settings, refetch } = useApi<SettingsData>("/api/settings");
  const cfg = settings?.data;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {cfg && (
        <>
          <NotionCard cfg={cfg.notion} onUpdate={refetch} />
          <WordPressCard cfg={cfg.wordpress} onUpdate={refetch} />
          <CodeHighlighterCard current={cfg.codeHighlighter} onUpdate={refetch} />
        </>
      )}
    </div>
  );
}

function NotionCard({
  cfg,
  onUpdate,
}: {
  cfg: SettingsData["data"]["notion"];
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const [dbId, setDbId] = useState("");
  const [saving, setSaving] = useState(false);

  async function connectOAuth() {
    const res = await call<{ data: { url: string } }>("/api/notion/oauth/authorize");
    window.location.href = res.data.url;
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await call("/api/settings/notion", {
        method: "PUT",
        body: { accessToken: token, databaseId: dbId || undefined },
      });
      setToken("");
      setDbId("");
      setShowManual(false);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Notion?")) return;
    await call("/api/settings/notion", { method: "DELETE" });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Notion</CardTitle>
            <CardDescription>
              {cfg.configured
                ? `Connected via ${cfg.authMode}`
                : "Not connected"}
            </CardDescription>
          </div>
          <Badge variant={cfg.configured ? "default" : "secondary"}>
            {cfg.configured ? "Connected" : "Disconnected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cfg.configured ? (
          <>
            {cfg.databaseId && (
              <div className="text-sm">
                <span className="text-muted-foreground">Database ID: </span>
                <code className="text-xs">{cfg.databaseId}</code>
              </div>
            )}
            <Button variant="destructive" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            {cfg.oauthAvailable && (
              <Button onClick={connectOAuth}>Connect to Notion</Button>
            )}
            <Separator />
            {showManual ? (
              <form onSubmit={saveManual} className="space-y-3">
                <div className="space-y-2">
                  <Label>Integration Token</Label>
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Database ID (optional)</Label>
                  <Input
                    value={dbId}
                    onChange={(e) => setDbId(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowManual(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowManual(true)}>
                Use manual token
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WordPressCard({
  cfg,
  onUpdate,
}: {
  cfg: SettingsData["data"]["wordpress"];
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const [editing, setEditing] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await call("/api/settings/wordpress", {
        method: "PUT",
        body: { siteUrl, username, appPassword },
      });
      setEditing(false);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect WordPress?")) return;
    await call("/api/settings/wordpress", { method: "DELETE" });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">WordPress</CardTitle>
            <CardDescription>
              {cfg.configured ? cfg.siteUrl : "Not connected"}
            </CardDescription>
          </div>
          <Badge variant={cfg.configured ? "default" : "secondary"}>
            {cfg.configured ? "Connected" : "Disconnected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {cfg.configured && !editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Update
            </Button>
            <Button variant="destructive" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-2">
              <Label>Site URL</Label>
              <Input
                type="url"
                placeholder="https://yourblog.com"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Application Password</Label>
              <Input
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              {cfg.configured && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function CodeHighlighterCard({
  current,
  onUpdate,
}: {
  current: string;
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const options = [
    { value: "WP_CODE", label: "WordPress Code Block" },
    { value: "HIGHLIGHT_JS", label: "Highlight.js" },
    { value: "PRISM_JS", label: "Prism.js" },
    { value: "PRISMATIC", label: "Prismatic" },
  ];

  async function change(value: string) {
    await call("/api/settings", {
      method: "PATCH",
      body: { codeHighlighter: value },
    });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Code Highlighter</CardTitle>
        <CardDescription>
          How code blocks are formatted in WordPress
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Button
              key={opt.value}
              variant={current === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => change(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
