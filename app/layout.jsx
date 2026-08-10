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
      <body style={{ background: "#EFEAE0" }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
