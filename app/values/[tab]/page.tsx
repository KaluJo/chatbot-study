import { redirect } from 'next/navigation';

// Friendly URL slug → internal tab id
const TAB_MAP: Record<string, string> = {
  survey:     'survey',
  extract:    'topics',
  extraction: 'topics',
  embody:     'personas',
  embodiment: 'personas',
  explain:    'evaluation',
  explanation:'evaluation',
};

interface Props {
  params: Promise<{ tab: string }>;
}

export default async function ValuesTabRedirect({ params }: Props) {
  const { tab } = await params;
  const tabId = TAB_MAP[tab.toLowerCase()];
  redirect(tabId ? `/values?tab=${tabId}` : '/values');
}

// Let Next.js statically generate all known slugs
export function generateStaticParams() {
  return Object.keys(TAB_MAP).map((tab) => ({ tab }));
}
