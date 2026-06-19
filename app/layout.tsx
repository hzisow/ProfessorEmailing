import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProfPing — research outreach console",
  description:
    "Source, verify, and cold-email business school professors about research positions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
