import type { Metadata } from "next";
import { Fraunces, Inter, Geist_Mono } from "next/font/google";

import { PublicAnalytics } from "@/components/public-analytics";
import { SiteGuards } from "@/components/site-guards";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { SITE_NAME, getSiteOrigin } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Apple Scholar is building tutoring experiences that help students think, question, and learn with more independence.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {GA_MEASUREMENT_ID ? (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){window.dataLayer.push(arguments);}
                  window.gtag = gtag;
                  gtag('js', new Date());
                  gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
                `,
              }}
            />
          </>
        ) : null}
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
      >
        <SiteGuards />
        <PublicAnalytics />
        {children}
      </body>
    </html>
  );
}
