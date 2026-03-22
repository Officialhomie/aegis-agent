export const ONBOARDING_STEPS = [
  'STEP_1_IDENTITY',
  'STEP_2_PROTOCOL',
  'STEP_3_DELEGATION',
  'STEP_4_POLICY',
  'STEP_5_READY',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
