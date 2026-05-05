import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pasugo App",
  description: "Local motor delivery — pabili, pahatid, pasundo",
  icons: {
    icon: "/logo_image/pasugo_logo_app.png",
    apple: "/logo_image/pasugo_logo_app.png",
  },
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
