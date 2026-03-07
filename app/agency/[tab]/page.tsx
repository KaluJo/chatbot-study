import { redirect } from 'next/navigation';

// Friendly URL slug → internal tab id
const TAB_MAP: Record<string, string> = {
  stats:      'analytics',
  analytics:  'analytics',
  chats:      'messages',
  messages:   'messages',
  patterns:   'patterns',
  speech:     'patterns',
  strategy:   'strategies',
  strategies: 'strategies',
};

interface Props {
  params: Promise<{ tab: string }>;
}

export default async function AgencyTabRedirect({ params }: Props) {
  const { tab } = await params;
  const tabId = TAB_MAP[tab.toLowerCase()];
  redirect(tabId ? `/agency?tab=${tabId}` : '/agency');
}

// Let Next.js statically generate all known slugs
export function generateStaticParams() {
  return Object.keys(TAB_MAP).map((tab) => ({ tab }));
}
