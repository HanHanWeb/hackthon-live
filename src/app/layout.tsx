import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// 自托管字体（来源 jsDelivr 的 @fontsource，仅 latin 子集）：
// 不依赖 Google Fonts 在线下载，离线 / 内网环境也能正常渲染
const display = localFont({
  src: [
    { path: "./fonts/space-grotesk-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/space-grotesk-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/space-grotesk-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hackathon Live · 活动大屏",
  description: "黑客松活动倒计时与格言大屏，支持后台实时配置。",
};

export const viewport: Viewport = {
  themeColor: "#04050a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={"dark " + display.variable + " " + mono.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
