import type { MetadataRoute } from "next";

import { getSiteOrigin, getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: getSiteUrl("/sitemap.xml"),
    host: getSiteOrigin(),
  };
}
