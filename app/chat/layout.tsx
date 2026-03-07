import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com';

export const metadata: Metadata = {
  title: 'Chat with Day',
  description:
    'Talk with Day — an AI companion from a CHI \'26 research study. Experience how a chatbot learns about your values through casual conversation.',
  alternates: {
    canonical: `${siteUrl}/chat`,
  },
  openGraph: {
    type: 'website',
    url: `${siteUrl}/chat`,
    title: 'Chat with Day | AI and My Values',
    description:
      'Talk with Day — an AI companion from a CHI \'26 research study. Experience how a chatbot learns about your values through casual conversation.',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full flex flex-col grow">
      {children}
    </div>
  );
}
