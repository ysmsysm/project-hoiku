import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "こどもロッカー",
    short_name: "こどもロッカー",
    description: "保育園の持ち物確認と準備を30秒で終えるためのアプリ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFBF2",
    theme_color: "#FFFBF2",
    lang: "ja",
    icons: [
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
