import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "充值发卡系统",
  description: "基于 Token 的登录采集与人工充值管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
