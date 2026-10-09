import type { Metadata } from "next";
import "@fontsource-variable/montserrat";
import "./globals.css";
export const metadata: Metadata = {
  title: "IssuePulse — Know before they notice",
  description:
    "Website monitoring, incident response, and status pages for your team.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
