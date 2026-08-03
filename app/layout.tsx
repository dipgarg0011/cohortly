import type { Metadata } from "next";
import { Nunito, Fraunces } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cohortly",
  description:
    "Connect with your college batch — mentors, seniors, and friends.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${fraunces.variable} h-full max-w-full overflow-x-hidden antialiased`}
    >
      <body className="flex min-h-full min-w-0 max-w-full flex-col overflow-x-hidden font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
