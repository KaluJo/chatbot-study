export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Four sessions shown in the demo chat view
export const DEMO_SESSION_IDS = [
  'e0d1780a-c9b2-4ada-866c-cbe5e45bb704', // Example Chat 1
  '6378f97e-a9b0-468f-94e4-8e41cae754d4', // Example Chat 2
  'a0857b0f-d375-4785-8410-f0441289a47d', // Example Chat 3
  'e3089947-08bf-4e57-97db-765f9b96ed3b', // Example Chat 4
  '0ab3836e-79f3-4f85-b7f3-7be2d235ac37', // Example Chat 5
] as const;

/** @deprecated use DEMO_SESSION_IDS */
export const DEMO_SESSION_ID = DEMO_SESSION_IDS[1];

export const DEMO_USER = {
  id: '3425d950-d745-4af8-af89-01454c301f71',
  name: 'Example User',
  email: undefined,
  isAdmin: false,
  role: 'user' as const,
  accessCode: 'demo',
  canGenerateSurveys: false,
  canUseSpeechPatterns: false,
};
