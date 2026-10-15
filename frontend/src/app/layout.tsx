import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tzmicha CRM 3.0",
  description: "Intelligent Customer Growth Operating System",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
