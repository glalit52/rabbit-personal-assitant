"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession } from "@/lib/api";

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <nav className="nav">
        <h1>the Agent</h1>
        <Link href="/approvals">Approvals</Link>
        <Link href="/activity">Activity</Link>
        <Link href="/policy">Policy</Link>
        <Link href="/connectors">Connectors</Link>
        <a
          onClick={(e) => {
            e.preventDefault();
            clearSession();
            router.push("/login");
          }}
          href="#"
        >
          Log out {getSessionEmail()}
        </a>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}

function getSessionEmail(): string {
  const session = typeof window !== "undefined" ? getSession() : null;
  return session ? `(${session.user.email})` : "";
}
