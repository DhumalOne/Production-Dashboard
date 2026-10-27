import type { MetadataRoute } from "next";

// "Add to Home Screen" on Android and iPhone (PRD §2: PWA, no app store).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dhumal Management Dashboard",
    short_name: "Dhumal",
    description: "Sales, money, stock and production for Dhumal Industries, live from SAP.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f6f8",
    theme_color: "#1f4fd1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
