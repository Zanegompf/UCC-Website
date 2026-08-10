const dev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * `script-src` still needs 'unsafe-inline' because the App Router ships inline
 * hydration scripts and there is no nonce plumbing here. That is weaker than
 * ideal, but the policy still refuses scripts loaded from anywhere that is not
 * this origin, which is what an injected <script src> would need.
 *
 * The font domains are here because globals.css imports Bodoni Moda, Archivo
 * and IBM Plex Mono from Google Fonts. Drop them if the fonts are ever
 * self-hosted.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The stack trace of a failed Upstash call is not something visitors need.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // frame-ancestors covers this for modern browsers; the old header is
          // still worth sending for the ones that ignore CSP.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Nothing under /api is ever safe for a CDN or a shared proxy to keep:
        // every response is shaped by who asked for it.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
