"use client";

import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { BottomNav } from "@/components/admin/bottom-nav";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { LoginForm } from "@/components/admin/login-form";
import { Toaster } from "sonner";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { apiKey, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!apiKey) {
    return <LoginForm />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="hidden md:flex h-12 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </SidebarInset>
      <BottomNav />
      <Toaster theme="dark" position="top-center" />
    </SidebarProvider>
  );
}

/** Sets html/body background + theme-color so phone safe areas match the dark theme */
function SetDarkMeta() {
  useEffect(() => {
    const bg = "#0a0a0a"; // oklch(0.145 0 0) ≈ dark --background
    document.documentElement.classList.add("dark");
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = bg;

    return () => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
      if (meta) meta.content = "";
    };
  }, []);
  return null;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark bg-background text-foreground min-h-screen">
      <SetDarkMeta />
      <AuthProvider>
        <AdminShell>{children}</AdminShell>
      </AuthProvider>
    </div>
  );
}
