"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogoIcon } from "@/components/landing/icons/logo";
import { Mail } from "lucide-react";

export function LoginForm() {
  const { login, register, setApiKey } = useAuth();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState<boolean | null>(null);
  const defaultTab = searchParams.get("tab") === "register" ? "register" : "email";

  // Email/password login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Registration
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [blogName, setBlogName] = useState("");
  const [registered, setRegistered] = useState(false);

  // Verification needed (from login attempt)
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // API key login
  const [key, setKey] = useState("");

  useEffect(() => {
    api<{ data: { signup: boolean } }>("/api/auth/providers")
      .then((res) => setSignupEnabled(res.data.signup))
      .catch(() => setSignupEnabled(false));
  }, []);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.body?.needsVerification) {
        setNeedsVerification(true);
        setVerificationEmail((err.body.email as string) || email);
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(regEmail, regPassword, blogName);
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResent(false);
    try {
      await api("/api/auth/resend-verification", {
        method: "POST",
        body: { email: verificationEmail || regEmail },
      });
      setResent(true);
    } catch {
      // silently fail — endpoint always returns success
    } finally {
      setResending(false);
    }
  }

  async function handleKeyLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await setApiKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid API key");
    } finally {
      setLoading(false);
    }
  }

  // "Check your email" state after registration
  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <LogoIcon className="w-12 h-12" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We sent a verification link to <strong>{regEmail}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <Mail className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Click the link in the email to verify your account, then come back to sign in.
              If you don&apos;t see it, check your spam folder.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? "Sending..." : resent ? "Sent!" : "Resend verification email"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setRegistered(false)}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <LogoIcon className="w-12 h-12" />
          </div>
          <CardTitle className="text-2xl">Notipo</CardTitle>
          <CardDescription>Sign in to your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {signupEnabled === null ? (
            <div className="flex justify-center py-8">
              <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
            </div>
          ) : (
          <Tabs defaultValue={signupEnabled ? defaultTab : "email"}>
            <TabsList className="w-full">
              <TabsTrigger value="email" className="flex-1">
                Sign in
              </TabsTrigger>
              {signupEnabled && (
                <TabsTrigger value="register" className="flex-1">
                  Register
                </TabsTrigger>
              )}
              <TabsTrigger value="apikey" className="flex-1">
                API Key
              </TabsTrigger>
            </TabsList>
            <TabsContent value="email">
              {needsVerification ? (
                <div className="space-y-4 mt-4 text-center">
                  <Mail className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Please verify your email before signing in. Check your inbox for a verification link.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleResend}
                    disabled={resending}
                  >
                    {resending ? "Sending..." : resent ? "Sent!" : "Resend verification email"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setNeedsVerification(false)}
                  >
                    Try again
                  </Button>
                </div>
              ) : (
              <form onSubmit={handleEmailLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/auth/forgot"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
              )}
            </TabsContent>
            {signupEnabled && (
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-blog">Blog name</Label>
                    <Input
                      id="reg-blog"
                      type="text"
                      value={blogName}
                      onChange={(e) => setBlogName(e.target.value)}
                      placeholder="My Awesome Blog"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            )}
            <TabsContent value="apikey">
              <form onSubmit={handleKeyLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="apikey">API Key</Label>
                  <Input
                    id="apikey"
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="Enter your API key"
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Connecting..." : "Connect"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
