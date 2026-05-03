import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simoleon Bank Converter",
  description: "The Sims-inspired Simoleon and world currency banking dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
