export interface BundledPack {
  slug: string;
  name: string;
  description: string;
}

export const bundledPacks: BundledPack[] = [
  { slug: 'anime-aesthetic', name: 'Anime Aesthetic', description: 'Anime stills, illustrated, animated character art.' },
  { slug: 'bright-and-minimal', name: 'Bright & Minimal', description: 'Airy, clean, natural daylight, white spaces.' },
  { slug: 'cinematic-landscapes', name: 'Cinematic Landscapes', description: 'Outdoor drama — mountains, fog, sunsets, scale.' },
  { slug: 'cluttered-realism', name: 'Cluttered Realism', description: 'Messy desks, lived-in spaces, real-life mess.' },
  { slug: 'cozy-indoor', name: 'Cozy Indoor', description: 'Warm, soft, candles, blankets, fireplaces.' },
  { slug: 'dark-and-moody', name: 'Dark & Moody', description: 'Low-key, dim, dramatic shadows, atmospheric.' },
  { slug: 'fitness-and-gym', name: 'Fitness & Gym', description: 'Gym mirror selfies, workout vibes, fitness lifestyle.' },
  { slug: 'luxury-lifestyle', name: 'Luxury Lifestyle', description: 'Watches, suits, cars, hotels — wealth signaling.' },
  { slug: 'mirror-selfies-and-pov', name: 'Mirror Selfies & POV', description: 'Bathroom, gym, bedroom mirrors. Hand-held candid.' },
  { slug: 'vintage-film', name: 'Vintage Film', description: 'Grainy, faded, retro 90s/2000s.' },
];

export function bundledImagePaths(pack: BundledPack): string[] {
  return Array.from({ length: 14 }, (_, index) =>
    `${pack.slug}/${String(index + 1).padStart(2, '0')}.jpg`,
  );
}
