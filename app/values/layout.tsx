import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com';

export const metadata: Metadata = {
  // Use absolute so the template doesn't double up ("AI and My Values | AI and My Values")
  title: { absolute: "AI and My Values" },
  description:
    "Does AI understand human values? 20 participants texted a chatbot for a month; the AI built value profiles and explained its reasoning. 13 participants left convinced AI truly understood them. Published at CHI '26.",
  keywords: [
    'AI values', 'value alignment', 'VAPT', 'value extraction', 'CHI 2026',
    'LLM values', 'human values AI', 'Bhada Yun', 'April Yi Wang', 'Renn Su',
    'weaponized empathy', 'value-aware AI',
  ],
  alternates: {
    canonical: `${siteUrl}/values`,
  },
  openGraph: {
    type: 'article',
    url: `${siteUrl}/values`,
    title: 'AI and My Values',
    description:
      "Does AI understand human values? 20 participants texted a chatbot for a month; the AI built value profiles and explained its reasoning. 13 left convinced.",
    images: [{ url: '/figures/values-teaser-light.png', width: 2025, height: 720, alt: 'AI and My Values teaser figure' }],
    authors: ['Bhada Yun', 'Renn Su', 'April Yi Wang'],
    publishedTime: '2026-01-01T00:00:00.000Z',
    tags: ['AI values', 'value alignment', 'CHI 2026', 'human-AI interaction'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI and My Values',
    description:
      "Does AI understand human values? 20 participants texted a chatbot for a month; the AI built value profiles and explained its reasoning.",
    images: [{ url: '/figures/values-teaser-light.png', alt: 'AI and My Values teaser figure' }],
  },
};

const valuesJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ScholarlyArticle',
  name: "AI and My Values: User Perceptions of LLMs' Ability to Extract, Embody, and Explain Human Values from Casual Conversations",
  headline: 'AI and My Values',
  description:
    "Does AI understand human values? We introduce VAPT, the Value-Alignment Perception Toolkit. 20 participants texted a chatbot over a month; 13 left convinced AI can understand human values.",
  url: 'https://arxiv.org/abs/2601.22440',
  sameAs: ['https://arxiv.org/abs/2601.22440'],
  datePublished: '2026-01-01',
  author: [
    { '@type': 'Person', name: 'Bhada Yun', url: 'https://bhadayun.com', affiliation: { '@type': 'Organization', name: 'ETH Zürich' } },
    { '@type': 'Person', name: 'Renn Su', url: 'https://rooyi.github.io' },
    { '@type': 'Person', name: 'April Yi Wang', url: 'https://aprilwang.me' },
  ],
  isPartOf: {
    '@type': 'Periodical',
    name: 'Proceedings of the CHI Conference on Human Factors in Computing Systems',
    publisher: { '@type': 'Organization', name: 'ACM', url: 'https://www.acm.org' },
  },
  about: ['value alignment', 'human-AI interaction', 'conversational AI', 'human values'],
  keywords: 'AI values, value alignment, VAPT, LLM, CHI 2026, human-AI interaction',
  image: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com'}/figures/values-teaser-light.png`,
};

export default function ValuesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(valuesJsonLd) }}
      />
      {children}
    </>
  );
}
