export interface GoogleFont {
  family: string;
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
}

/**
 * Curated list of popular Google Fonts, ordered roughly by popularity.
 * The backend persists per-user favorites from this list; the frontend loads
 * them through the public Google Fonts CSS API (no key required).
 */
export const GOOGLE_FONTS: GoogleFont[] = [
  { family: "Roboto", category: "sans-serif" },
  { family: "Open Sans", category: "sans-serif" },
  { family: "Montserrat", category: "sans-serif" },
  { family: "Lato", category: "sans-serif" },
  { family: "Poppins", category: "sans-serif" },
  { family: "Inter", category: "sans-serif" },
  { family: "Oswald", category: "sans-serif" },
  { family: "Raleway", category: "sans-serif" },
  { family: "Nunito", category: "sans-serif" },
  { family: "Rubik", category: "sans-serif" },
  { family: "Work Sans", category: "sans-serif" },
  { family: "Barlow", category: "sans-serif" },
  { family: "Barlow Condensed", category: "sans-serif" },
  { family: "Archivo", category: "sans-serif" },
  { family: "Anton", category: "sans-serif" },
  { family: "Bebas Neue", category: "display" },
  { family: "Playfair Display", category: "serif" },
  { family: "Merriweather", category: "serif" },
  { family: "Lora", category: "serif" },
  { family: "PT Serif", category: "serif" },
  { family: "Libre Baskerville", category: "serif" },
  { family: "Cinzel", category: "serif" },
  { family: "Abril Fatface", category: "display" },
  { family: "Righteous", category: "display" },
  { family: "Alfa Slab One", category: "display" },
  { family: "Pacifico", category: "handwriting" },
  { family: "Lobster", category: "display" },
  { family: "Dancing Script", category: "handwriting" },
  { family: "Caveat", category: "handwriting" },
  { family: "Permanent Marker", category: "handwriting" },
  { family: "Bangers", category: "display" },
  { family: "Creepster", category: "display" },
  { family: "Press Start 2P", category: "display" },
  { family: "Orbitron", category: "sans-serif" },
  { family: "Monoton", category: "display" },
  { family: "Titan One", category: "display" },
  { family: "Fredoka One", category: "display" },
  { family: "Comfortaa", category: "display" },
  { family: "Quicksand", category: "sans-serif" },
  { family: "Josefin Sans", category: "sans-serif" },
  { family: "Teko", category: "sans-serif" },
  { family: "Russo One", category: "display" },
  { family: "Passion One", category: "display" },
  { family: "Fira Sans", category: "sans-serif" },
  { family: "Source Sans Pro", category: "sans-serif" },
  { family: "Ubuntu", category: "sans-serif" },
  { family: "Exo 2", category: "sans-serif" },
  { family: "Space Grotesk", category: "sans-serif" },
  { family: "JetBrains Mono", category: "monospace" },
  { family: "Roboto Mono", category: "monospace" },
  { family: "IBM Plex Mono", category: "monospace" },
];
