"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Menu, Moon, Sun, X } from "lucide-react";
import { api } from "@/lib/api";
import { useUI } from "@/lib/store";

type MegaColumn = {
  eyebrow: string;
  links: { label: string; href: string; active?: boolean; badge?: string; hint?: string }[];
};

type MegaMenu = {
  columns: MegaColumn[];
  footerLinks?: { label: string; href: string }[];
  showSources?: boolean;
};

/** Navbar content mirrors the real product flow:
 *  watch (Map) → decide (need score) → detect patterns (ML) → plan (budget) → verify (data). */
const EXPLORE_MENU: MegaMenu = {
  columns: [
    {
      eyebrow: "Watch the country",
      links: [
        { label: "3D Globe", href: "/", active: true, hint: "30 districts, extruded by metric" },
        { label: "2D Map & ranking", href: "/map", hint: "synchronized choropleth + bars" },
      ],
    },
    {
      eyebrow: "Decide",
      links: [
        { label: "Need score builder", href: "/priority-index", badge: "core", hint: "your weights, live ranking" },
      ],
    },
  ],
  footerLinks: [
    { label: "How the need score works", href: "/data" },
    { label: "Data sources & licenses", href: "/data" },
  ],
  showSources: true,
};

const ANALYTICS_MENU: MegaMenu = {
  columns: [
    {
      eyebrow: "Detect patterns",
      links: [
        { label: "Ask the data", href: "/assistant", badge: "AI", hint: "chat with live data and ML" },
        { label: "District typologies", href: "/typologies", badge: "ML", hint: "K-Means clusters + silhouette" },
        { label: "Deprivation drivers", href: "/drivers", hint: "gradient-boosted importances" },
      ],
    },
  ],
  footerLinks: [
    { label: "Methodology (summary)", href: "/data" },
  ],
};

const PLAN_MENU: MegaMenu = {
  columns: [
    {
      eyebrow: "Allocate",
      links: [
        { label: "Budget simulator", href: "/simulator", active: true, hint: "RWF envelope → auditable split" },
      ],
    },
    {
      eyebrow: "Verify",
      links: [
        { label: "Indicator catalog", href: "/data", hint: "what exists, what's pending" },
      ],
    },
  ],
};

const NAV_ITEMS: { label: string; href?: string; hasMenu?: boolean; menu?: MegaMenu }[] = [
  { label: "Explore", href: "/", hasMenu: true, menu: EXPLORE_MENU },
  { label: "Analytics", hasMenu: true, menu: ANALYTICS_MENU },
  { label: "Plan", hasMenu: true, menu: PLAN_MENU },
  { label: "Data & Method", href: "/data" },
];

/** Real provenance links replace placeholder social icons. */
const SOURCES = [
  { label: "NISR", href: "https://www.statistics.gov.rw" },
  { label: "NISR Microdata", href: "https://microdata.statistics.gov.rw" },
  { label: "GeoBoundaries", href: "https://www.geoboundaries.org" },
  { label: "HDX", href: "https://data.humdata.org" },
  { label: "OpenStreetMap", href: "https://www.openstreetmap.org" },
];

/** Expand/collapse panel driven purely by CSS grid-rows transition — no JS animation lib. */
function Collapse({ open, children, className = "" }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${className}`}
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export default function Navbar2() {
  const pathname = usePathname();
  const store = useUI();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const healthQ = useQuery({ queryKey: ["health"], queryFn: api.health });
  const manifestQ = useQuery({ queryKey: ["manifest"], queryFn: api.manifest });

  const toggleMenu = (label: string, hasMenu?: boolean) => {
    if (!hasMenu) { setOpenMenu(null); return; }
    setOpenMenu((c) => (c === label ? null : label));
  };

  // hover-open with a small close delay, so the pointer can travel safely into the dropdown
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140);
  };

  // close menus on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // close menus on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenMenu(null); setMobileOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // close menus on route change
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  const activeMenu = openMenu ? (NAV_ITEMS.find((i) => i.label === openMenu)?.menu ?? null) : null;
  const isOpenRoute = (href: string) => pathname === href;

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50"
      style={{ background: "var(--g-color-base-background)" }}
    >
      {/* single aligned container; dropdowns anchor to it */}
      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-8"
        onMouseLeave={scheduleClose}
        onMouseEnter={cancelClose}>
        {/* Top row */}
        <div className="flex items-center justify-between gap-4 py-4">
          <Link href="/" className="flex shrink-0 items-center gap-2" onClick={() => setOpenMenu(null)}>
            <img src="/logo.svg" alt="Rwanda Compass" className="h-8 w-8" />
            <span className="text-[1.2rem] font-semibold tracking-tight" style={{ color: "var(--rc-fg)" }}>
              Rwanda<span className="rc-brand-red">Compass</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => {
              const isOpen = openMenu === item.label;
              if (!item.hasMenu) {
                return (
                  <Link key={item.label} href={item.href ?? "#"}
                    onClick={() => toggleMenu(item.label, false)}
                    onMouseEnter={() => { cancelClose(); setOpenMenu(null); }}
                    className="rc-navlink rounded-md px-4 py-2 text-[15px] font-medium transition-colors"
                    style={{
                      color: "var(--rc-fg)",
                      background: isOpenRoute(item.href ?? "") ? "var(--g-color-base-selection)" : "transparent",
                    }}>
                    {item.label}
                  </Link>
                );
              }
              return (
                <button key={item.label} onClick={() => toggleMenu(item.label, item.hasMenu)}
                  onMouseEnter={() => { cancelClose(); setOpenMenu(item.label); }}
                  aria-expanded={isOpen}
                  className="flex items-center gap-1 rounded-md px-4 py-2 text-[15px] font-medium transition-colors"
                  style={{
                    color: "var(--rc-fg)",
                    background: isOpen ? "var(--g-color-base-selection)" : "transparent",
                  }}>
                  {item.label}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            <div className="flex items-center rounded-md" style={{ background: "var(--g-color-base-selection)" }}>
              <button
                onClick={() => store.setLanguage("en")}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold transition-opacity hover:opacity-75"
                style={{
                  background: store.language === "en" ? "var(--g-color-base-brand)" : "transparent",
                  color: store.language === "en" ? "var(--g-color-private-brand-1000-solid)" : "var(--rc-fg)",
                }}
              >
                EN
              </button>
              <button
                onClick={() => store.setLanguage("kin")}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold transition-opacity hover:opacity-75"
                style={{
                  background: store.language === "kin" ? "var(--g-color-base-brand)" : "transparent",
                  color: store.language === "kin" ? "var(--g-color-private-brand-1000-solid)" : "var(--rc-fg)",
                }}
              >
                KIN
              </button>
            </div>

            <button onClick={store.toggleTheme} aria-label="Toggle theme"
              className="grid h-9 w-9 place-items-center rounded-md"
              style={{ background: "var(--g-color-base-selection)", color: "var(--rc-fg)" }}>
              {store.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <Link href="/assistant"
              className="flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }}>
              <img src="/assistant.svg" alt="" className="h-5 w-5" aria-hidden="true" />
              Ask
            </Link>
          </div>

          {/* Mobile trigger */}
          <button onClick={() => setMobileOpen((v) => !v)}
            className="rc-navlink flex items-center justify-center rounded-md p-2 lg:hidden"
            style={{ color: "var(--rc-fg)" }}
            aria-label="Open menu">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Desktop mega dropdown — anchored to the header container, full-width panel */}
        <Collapse open={!!activeMenu} className="absolute inset-x-0 top-full z-40 hidden lg:block">
          {activeMenu && (
            <div key={openMenu} style={{ background: "var(--g-color-base-background)" }}>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-10 px-8 pb-8 pt-2">
                {activeMenu.columns.map((col, colIdx) => (
                  <div key={col.eyebrow} className="flex flex-col gap-6">
                    <span className="w-fit rounded-md px-4 py-1.5 text-xs font-medium rc-muted"
                      style={{ background: "var(--g-color-base-selection)" }}>
                      {col.eyebrow}
                    </span>
                    <ul className="flex flex-col gap-4">
                      {col.links.map((link) => (
                        <li key={link.label}>
                          <Link href={link.href} onClick={() => setOpenMenu(null)}
                            className="group flex flex-col text-xl font-semibold hover:opacity-70"
                            style={{
                              color: "var(--rc-fg)",
                              textDecoration: link.active || isOpenRoute(link.href) ? "underline" : "none",
                              textUnderlineOffset: 4,
                            }}>
                            <span className="flex items-center gap-2">
                              {link.label}
                              {link.badge && (
                                <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{ background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }}>
                                  {link.badge}
                                </span>
                              )}
                            </span>
                            {link.hint && <span className="text-sm font-normal rc-muted">{link.hint}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {colIdx === activeMenu.columns.length - 1 && activeMenu.footerLinks && (
                      <div className="mt-auto flex flex-col gap-2 pt-16">
                        {activeMenu.footerLinks.map((l) => (
                          <Link key={l.label} href={l.href} onClick={() => setOpenMenu(null)}
                            className="text-sm rc-muted hover:opacity-70">
                            {l.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Live preview panel — real numbers from the API, never stock photos */}
                <div className="hidden h-64 w-72 flex-col justify-end rounded-md p-5"
                  style={{ background: "var(--g-color-base-selection)" }}>
                  <p className="text-xs font-medium uppercase tracking-wide rc-muted">Live from the API</p>
                  <div className="mt-3 flex flex-col gap-3">
                    <div>
                      <p className="text-2xl font-bold" style={{ color: "var(--rc-fg)" }}>{manifestQ.data?.n_districts ?? "—"}</p>
                      <p className="text-xs rc-muted">districts under analysis</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold" style={{ color: "var(--rc-fg)" }}>
                        {manifestQ.data ? manifestQ.data.n_facilities.toLocaleString("en-US") : "—"}
                      </p>
                      <p className="text-xs rc-muted">facilities mapped to districts</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold" style={{ color: "var(--rc-fg)" }}>
                        {healthQ.data && !Number.isNaN(new Date(healthQ.data.as_of).getTime())
                          ? new Date(healthQ.data.as_of).toLocaleDateString("en-GB") : "—"}
                      </p>
                      <p className="text-xs rc-muted">data build (UTC)</p>
                    </div>
                  </div>
                </div>
              </div>

              {activeMenu.showSources && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-8 pb-8">
                  <span className="text-xs font-medium uppercase tracking-wide rc-muted">Sources</span>
                  {SOURCES.map((s) => (
                    <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
                      className="text-sm hover:underline" style={{ color: "var(--g-color-text-brand)" }}>
                      {s.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </Collapse>

        {/* Mobile panel */}
        <Collapse open={mobileOpen} className="lg:hidden">
          <div className="flex flex-col gap-1 px-2 pb-6" style={{ background: "var(--g-color-base-background)" }}>
            {NAV_ITEMS.map((item) => (
              <div key={item.label}>
                {item.hasMenu ? (
                  <>
                    <span className="block px-3 pt-3 text-xs font-medium uppercase tracking-wide rc-muted">
                      {item.label}
                    </span>
                    {item.menu!.columns.flatMap((c) =>
                      c.links.map((link) => (
                        <Link key={link.label} href={link.href} onClick={() => setMobileOpen(false)}
                          className="flex items-center justify-between rounded-md px-3 py-3 text-base font-medium hover:opacity-70"
                          style={{
                            color: "var(--rc-fg)",
                            textDecoration: isOpenRoute(link.href) ? "underline" : "none",
                            textUnderlineOffset: 4,
                          }}>
                          {link.label}
                          {link.badge && (
                            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                              style={{ background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }}>
                              {link.badge}
                            </span>
                          )}
                        </Link>
                      )),
                    )}
                    {item.menu!.footerLinks?.map((l) => (
                      <Link key={l.label} href={l.href} onClick={() => setMobileOpen(false)}
                        className="block rounded-md px-3 py-2 text-sm rc-muted hover:opacity-70">
                        {l.label}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link href={item.href ?? "#"} onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-md px-3 py-3 text-left text-base font-medium hover:opacity-70"
                    style={{ color: "var(--rc-fg)" }}>
                    {item.label}
                  </Link>
                )}
              </div>
            ))}

            <div className="mt-4 flex flex-col gap-3 pt-4">
              <Link href="/assistant" onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-center text-sm font-semibold"
                style={{ background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }}>
                <img src="/assistant.svg" alt="" className="h-5 w-5" aria-hidden="true" />
                Ask
              </Link>
            </div>
          </div>
        </Collapse>
      </div>
    </header>
  );
}
