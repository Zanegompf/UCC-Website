import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

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
        <Analytics />
      </body>
    </html>
  );
}
