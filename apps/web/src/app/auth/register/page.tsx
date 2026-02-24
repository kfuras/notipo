"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthRegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/login?tab=register");
  }, [router]);

  return null;
}
