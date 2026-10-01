"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession } from "@/lib/api";

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // localStorage isn't available during server render, so this starts empty on both
  // the server and the client's first paint and only fills in after mount — filling
  // it in during render instead causes a hydration mismatch (server: "", client: "(email)").
  const [email, setEmail] = useState("");

  useEffect(() => {
    const session = getSession();
    if (session) setEmail(`(${session.user.email})`);
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <nav className="nav">
        <h1>the Agent</h1>
        <Link href="/brief">Brief</Link>
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
          Log out {email}
        </a>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
