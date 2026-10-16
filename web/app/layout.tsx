import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { generalSans } from "./fonts";
import { Providers } from "@/components/Providers";
import Navbar2 from "@/components/ui/navbar2";
import { DistrictDrawer } from "@/components/DistrictDrawer";

export const metadata: Metadata = {
  title: "Rwanda Compass — District Development Intelligence",
  description:
    "Evidence-based decision support for Rwanda's 30 districts — priority ranking, district typologies, deprivation drivers and budget allocation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${generalSans.variable} g-root_theme_light`} suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>
          <Navbar2 />
          <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-4">{children}</main>
          <DistrictDrawer />
          <footer className="border-t px-4 py-6 text-xs rc-muted" style={{ borderColor: "var(--rc-border)" }}>
            <div className="mx-auto flex max-w-[1400px] flex-wrap gap-x-6 gap-y-2">
              <span>Data: NISR (CC BY 4.0) · geoBoundaries (CC BY 4.0) · ©OpenStreetMap (ODbL) · FEWS NET</span>
              <span>API: <Link className="underline"
                href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"}/docs`}>/docs</Link></span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
