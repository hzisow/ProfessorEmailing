"use client";

import { DashProvider } from "@/lib/dash-store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashProvider>{children}</DashProvider>;
}
