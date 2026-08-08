import type { MetadataRoute } from "next";

type HelloAiManifest = MetadataRoute.Manifest & {
  display_override: string[];
  prefer_related_applications: false;
  launch_handler: { client_mode: "navigate-existing" };
};

export default function manifest(): HelloAiManifest {
  return {
    id: "/",
    name: "HelloAI — Local AI Chat",
    short_name: "HelloAI",
    description: "Open and chat with AI. Conversations and images stay in your browser.",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    prefer_related_applications: false,
    launch_handler: { client_mode: "navigate-existing" },
    orientation: "any",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "New chat",
        short_name: "New chat",
        description: "Open HelloAI in a new local conversation.",
        url: "/?new=1",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
