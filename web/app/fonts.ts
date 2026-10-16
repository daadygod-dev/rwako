import localFont from "next/font/local";

// General Sans (variable, 200–700) served from public/fonts/TTF — self-hosted,
// no runtime font CDN. Fontshare package dropped in by the team; ITF FFL license.
export const generalSans = localFont({
  src: "../public/Fonts/TTF/GeneralSans-Variable.ttf",
  weight: "200 700",
  style: "normal",
  display: "swap",
  variable: "--font-general-sans",
});
