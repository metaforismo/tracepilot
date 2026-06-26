import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TracePilot Studio",
  description: "Trace replay and reliability workbench for computer-use agents."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

