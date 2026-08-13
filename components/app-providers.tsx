"use client";

import type { ReactNode } from "react";
import { ProfilePreviewProvider } from "@/components/profile-preview";
import { Footer } from "@/components/Footer";

export function AppProviders({
  children,
  adminLink,
}: {
  children: ReactNode;
  /** Server-rendered admin-only footer slot (e.g. FooterAdminLink). */
  adminLink?: ReactNode;
}) {
  return (
    <ProfilePreviewProvider>
      <div className="flex w-full min-h-full min-w-0 max-w-full flex-1 flex-col overflow-x-clip">
        <div className="flex w-full min-h-0 min-w-0 max-w-full flex-1 flex-col">
          {children}
        </div>
        <Footer adminLink={adminLink} />
      </div>
    </ProfilePreviewProvider>
  );
}
