import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com';

// Static date so the sitemap doesn't change on every build
const lastMod = new Date('2026-01-30');

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // In demo mode the root 301s to /chat, so only list /chat as the canonical entry point
    ...(isDemoMode
      ? []
      : [{ url: siteUrl, lastModified: lastMod, changeFrequency: 'monthly' as const, priority: 1 }]),
    {
      url: `${siteUrl}/chat`,
      lastModified: lastMod,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${siteUrl}/values`,
      lastModified: lastMod,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${siteUrl}/agency`,
      lastModified: lastMod,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
