"use client";

import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { BottomNav } from "@/components/admin/bottom-nav";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { LoginForm } from "@/components/admin/login-form";

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
    </SidebarProvider>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark bg-background text-foreground">
      <AuthProvider>
        <AdminShell>{children}</AdminShell>
      </AuthProvider>
    </div>
  );
}
