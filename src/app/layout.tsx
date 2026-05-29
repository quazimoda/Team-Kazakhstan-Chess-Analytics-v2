import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team Kazakhstan Chess Analytics v2",
  description: "Analytics platform for Team Kazakhstan Chess.com leagues, matches, and player contributions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
