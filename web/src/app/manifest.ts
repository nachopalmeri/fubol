import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fubol",
    short_name: "Fubol",
    description: "Fútbol en vivo y VOSE para la familia.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#07090a",
    theme_color: "#07090a",
    lang: "es-AR",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
