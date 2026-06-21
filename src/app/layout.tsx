import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Investment Dashboard",
  description: "Real-time stock portfolio performance tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
