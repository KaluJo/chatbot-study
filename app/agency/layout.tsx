import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com';

export const metadata: Metadata = {
  title: 'Does My Chatbot Have an Agenda?',
  description:
    'Explore perceived human and AI agency in sustained conversation. A month-long study with 22 adults who chatted with "Day", revealing how conversational control is co-constructed turn-by-turn. Published at CHI \'26.',
  keywords: [
    'AI agency', 'human-AI agency', 'chatbot agenda', 'conversational control', 'CHI 2026',
    'Day chatbot', 'Bhada Yun', 'April Yi Wang', 'translucent design', 'AI companion',
    'human-AI interaction', 'longitudinal study',
  ],
  alternates: {
    canonical: `${siteUrl}/agency`,
  },
  openGraph: {
    type: 'article',
    url: `${siteUrl}/agency`,
    title: 'Does My Chatbot Have an Agenda? | AI and My Values',
    description:
      'Explore perceived human and AI agency in sustained conversation. A month-long study with 22 adults who chatted with "Day", revealing how conversational control is co-constructed turn-by-turn.',
    images: [{ url: '/figures/agency-teaser.png', width: 3072, height: 1647, alt: 'Does My Chatbot Have an Agenda? teaser figure' }],
    authors: ['Bhada Yun', 'Evgenia Taranova', 'April Yi Wang'],
    publishedTime: '2026-01-01T00:00:00.000Z',
    tags: ['AI agency', 'human-AI interaction', 'CHI 2026', 'conversational AI'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Does My Chatbot Have an Agenda? | AI and My Values',
    description:
      'Explore perceived human and AI agency in sustained conversation. A month-long study with 22 adults who chatted with "Day".',
    images: [{ url: '/figures/agency-teaser.png', alt: 'Does My Chatbot Have an Agenda? teaser figure' }],
  },
};

const agencyJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ScholarlyArticle',
  name: 'Does My Chatbot Have an Agenda? Understanding Human and AI Agency in Human-Human-like Chatbot Interaction',
  headline: 'Does My Chatbot Have an Agenda?',
  description:
    'A month-long longitudinal study with 22 adults who chatted with "Day", an LLM companion. We discover agency manifests as an emergent, shared experience co-constructed turn-by-turn.',
  url: 'https://arxiv.org/abs/2601.22452',
  sameAs: ['https://arxiv.org/abs/2601.22452'],
  datePublished: '2026-01-01',
  author: [
    { '@type': 'Person', name: 'Bhada Yun', url: 'https://www.bhadayun.com', affiliation: { '@type': 'Organization', name: 'ETH Zürich' } },
    { '@type': 'Person', name: 'Evgenia Taranova' },
    { '@type': 'Person', name: 'April Yi Wang', url: 'https://aprilwang.me' },
  ],
  isPartOf: {
    '@type': 'Periodical',
    name: 'Proceedings of the CHI Conference on Human Factors in Computing Systems',
    publisher: { '@type': 'Organization', name: 'ACM', url: 'https://www.acm.org' },
  },
  about: ['AI agency', 'human-AI interaction', 'conversational control', 'chatbot design'],
  keywords: 'AI agency, human-AI interaction, chatbot, CHI 2026, longitudinal study, conversational AI',
  image: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com'}/figures/agency-teaser.png`,
};

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(agencyJsonLd) }}
      />
      {children}
    </>
  );
}
