"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { GA_MEASUREMENT_ID, isPublicAnalyticsPath } from "@/lib/analytics";

export function PublicAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      !GA_MEASUREMENT_ID ||
      !pathname ||
      !isPublicAnalyticsPath(pathname) ||
      typeof window === "undefined" ||
      !window.gtag
    ) {
      return;
    }

    const search = window.location.search;
    const pagePath = search ? `${pathname}${search}` : pathname;

    window.gtag("event", "page_view", {
      send_to: GA_MEASUREMENT_ID,
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
