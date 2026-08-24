import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Hermes command center",
    start_url: "/",
    scope: "/",
    // WebKit's web-app identity key. It costs nothing here — one app, one
    // scope — but without it iOS has only the URL it was installed from to go
    // on, and that URL is whatever project happened to be open. See
    // LaunchNormalizer for the half of this that actually works on iOS.
    id: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    // A dark shell behind a white flash on every cold start is the thing that
    // makes an installed PWA feel like a browser. Matching all three — the
    // manifest background, the theme colour and the body — removes it.
    icons: [
      // Nous' Hermes mark, the same one the agent's own docs use. Raster
      // rather than the vector that used to live here: it is line art with a
      // frame, and there is no build step in this project that could turn a
      // PNG into an SVG worth shipping.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        // maskable is a separate entry, not an extra word on the ones above:
        // Chrome crops an "any maskable" icon on every surface, including the
        // ones that wanted the untouched art. This copy is inset so the frame
        // survives the circle.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
