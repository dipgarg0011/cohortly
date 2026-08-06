"use client";

import type { ReactNode } from "react";
import { ProfilePreviewProvider } from "@/components/profile-preview";
import { Footer } from "@/components/Footer";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ProfilePreviewProvider>
      <div className="flex w-full min-h-full min-w-0 flex-1 flex-col">
        <div className="flex w-full min-h-0 min-w-0 flex-1 flex-col">
          {children}
        </div>
        <Footer />
      </div>
    </ProfilePreviewProvider>
  );
}
