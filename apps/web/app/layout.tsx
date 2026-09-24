import type { Metadata } from "next";
import "./globals.css";
import { NavShell } from "./nav-shell";

export const metadata: Metadata = {
  title: "the Agent — Control Center",
  description: "Approvals, activity and policy for your AI agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
