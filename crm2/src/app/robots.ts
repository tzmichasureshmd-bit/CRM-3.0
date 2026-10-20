import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tzmicha.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/inbox",
          "/contacts",
          "/broadcasts",
          "/automations",
          "/flows",
          "/agents",
          "/pipelines",
          "/reports",
          "/notifications",
          "/settings",
          "/billing",
          "/admin",
          "/super-admin",
          "/api",
          "/join",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
