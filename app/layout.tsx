import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "原野小队：巨兽远征",
  description: "明亮原始幻想四人小队手游：自动战斗、技能策略、灵宠养成、巨兽冒险、离线挂机与云存档。",
  applicationName: "原野小队",
  manifest: "/manifest.webmanifest",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f3c35f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
