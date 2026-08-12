import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "The United Commerce Corporation",
  description:
    "Share price, financial record, staff and projects of United Commerce (UCC), a company on the DemocracyCraft server.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* The shell is dark at both ends, so overscroll should be too. */}
      <body style={{ background: "#060D16" }}>
        {children}
        {/*
          Vercel's own analytics. It serves its script and posts its counts
          from /_vercel/insights on this domain, so the CSP's `script-src
          'self'` and `connect-src 'self'` already cover it — no third-party
          origin to allow, and nothing to loosen. It is inert anywhere but a
          Vercel deployment, so local builds are unaffected.
        */}
        <Analytics />
      </body>
    </html>
  );
}
