import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/login', '/logout', '/setup', '/recovery'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
