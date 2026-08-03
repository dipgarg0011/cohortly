"use client";

import type { ReactNode } from "react";
import { ProfilePreviewProvider } from "@/components/profile-preview";

export function AppProviders({ children }: { children: ReactNode }) {
  return <ProfilePreviewProvider>{children}</ProfilePreviewProvider>;
}
