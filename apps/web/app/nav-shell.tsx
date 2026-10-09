"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, clearSession, getSession } from "@/lib/api";
import { Icon, ICONS } from "@/components/ui";

const NAV = [
  {
    section: "Operate",
    items: [
      { href: "/brief", label: "Brief", icon: ICONS.brief },
      { href: "/approvals", label: "Approvals", icon: ICONS.approvals },
      { href: "/activity", label: "Activity", icon: ICONS.activity },
    ],
  },
  {
    section: "Configure",
    items: [
      { href: "/policy", label: "Policy", icon: ICONS.policy },
      { href: "/connectors", label: "Connectors", icon: ICONS.connectors },
    ],
  },
];

const TITLES: Record<string, { title: string; crumb: string }> = {
  "/brief": { title: "Daily Brief", crumb: "Brief" },
  "/approvals": { title: "Approvals", crumb: "Approvals" },
  "/activity": { title: "Activity", crumb: "Activity" },
  "/policy": { title: "Policy", crumb: "Policy" },
  "/connectors": { title: "Connectors", crumb: "Connectors" },
};

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setEmail(session.user.email);
      apiFetch<{ pendingApprovalsCount: number }>("/brief")
        .then((b) => setPending(b.pendingApprovalsCount))
        .catch(() => setPending(null));
    }
  }, [pathname]);

  useEffect(() => setDrawer(false), [pathname]);

  if (pathname === "/login") return <>{children}</>;

  const meta = TITLES[pathname] ?? { title: "Control Center", crumb: "Home" };
  const initial = (email || "?").charAt(0).toUpperCase();

  function logout() {
    clearSession();
    router.push("/login");
  }

  const sidebar = (
    <>
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">A</div>
        <div>
          <div className="brand-name">Rabbit</div>
          <div className="brand-sub">Control Center</div>
        </div>
      </div>
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="nav-section">{group.section}</div>
          {group.items.map((item) => {
            const active = pathname === item.href || (item.href === "/brief" && pathname === "/");
            return (
              <Link key={item.href} href={item.href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon d={item.icon} />
                <span>{item.label}</span>
                {item.href === "/approvals" && pending !== null && pending > 0 && <span className="nav-dot">{pending}</span>}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="sidebar-foot">
        <div className="user-chip">
          <div className="user-avatar" aria-hidden="true">{initial}</div>
          <div className="user-meta">
            <div className="user-email" title={email}>{email || "Signed in"}</div>
            <div className="user-role">Workspace owner</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout} aria-label="Log out" title="Log out" style={{ padding: 6 }}>
            <Icon d={ICONS.logout} size={15} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="shell">
      <nav className="sidebar" data-open={drawer} aria-label="Primary">
        {sidebar}
      </nav>
      {drawer && <button type="button" className="scrim" data-open={drawer} aria-label="Close menu" onClick={() => setDrawer(false)} />}
      <div className="main-col">
        <header className="topbar">
          <button type="button" className="btn btn-ghost btn-sm menu-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Icon d={ICONS.menu} size={16} />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="hide-sm">Control Center</span>
            <span className="hide-sm" aria-hidden="true">/</span>
            <strong>{meta.crumb}</strong>
          </nav>
          <div className="topbar-actions">
            <Link href="/brief" className="btn btn-sm" style={{ textDecoration: "none" }}>
              <Icon d={ICONS.refresh} size={14} />
              <span className="hide-sm">Today</span>
            </Link>
            <Link href="/approvals" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
              Review queue{pending ? ` (${pending})` : ""}
            </Link>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
