import type { Metadata, Viewport } from "next";
import "./globals.css";

const appleStartupImages = [
  [440, 956, 3, 1320, 2868],
  [430, 932, 3, 1290, 2796],
  [428, 926, 3, 1284, 2778],
  [414, 896, 3, 1242, 2688],
  [402, 874, 3, 1206, 2622],
  [393, 852, 3, 1179, 2556],
  [390, 844, 3, 1170, 2532],
  [375, 812, 3, 1125, 2436],
  [414, 896, 2, 828, 1792],
  [375, 667, 2, 750, 1334],
] as const;

export const metadata: Metadata = {
  applicationName: "こどもロッカー",
  title: "こどもロッカー",
  description: "保育園の持ち物確認と準備を30秒で終えるためのアプリ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "こどもロッカー",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      {
        url: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFBF2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" style={{ backgroundColor: "#FFFBF2" }}>
      <head>
        {appleStartupImages.map(
          ([deviceWidth, deviceHeight, pixelRatio, imageWidth, imageHeight]) => (
            <link
              key={`${deviceWidth}x${deviceHeight}@${pixelRatio}`}
              rel="apple-touch-startup-image"
              href={`/icons/startup/iphone-${imageWidth}x${imageHeight}.png`}
              media={`(device-width: ${deviceWidth}px) and (device-height: ${deviceHeight}px) and (-webkit-device-pixel-ratio: ${pixelRatio}) and (orientation: portrait)`}
            />
          ),
        )}
      </head>
      <body style={{ backgroundColor: "#FFFBF2" }}>{children}</body>
    </html>
  );
}
