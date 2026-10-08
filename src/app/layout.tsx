import type { Metadata } from "next";
import "./globals.css";
import { CustomCursor } from "@/components/ui/CustomCursor";

export const metadata: Metadata = {
  title: "Tzmicha CRM 3.0",
  description: "AI-powered CRM platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
