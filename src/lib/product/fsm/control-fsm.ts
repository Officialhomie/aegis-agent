import { getPrisma } from '@/src/lib/db';
import { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/onboarding-steps';

export { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/onboarding-steps';

function stepIndex(step: string): number {
  const i = ONBOARDING_STEPS.indexOf(step as OnboardingStep);
  return i < 0 ? 0 : i;
}

function completionForStep(step: string): number {
  const i = stepIndex(step);
  return Math.round(((i + 1) / ONBOARDING_STEPS.length) * 100);
}

export async function getOnboardingState(sessionId: string) {
  const prisma = getPrisma();
  const row = await prisma.controlOnboardingState.findUnique({
    where: { sessionId },
  });
  if (!row) {
    return {
      step: 'STEP_1_IDENTITY' as OnboardingStep,
      payload: {} as Record<string, unknown>,
      completionPct: 0,
    };
  }
  return {
    step: row.step as OnboardingStep,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    completionPct: row.completionPct,
  };
}

export async function advanceOnboarding(params: {
  sessionId: string;
  step: OnboardingStep;
  payload: Record<string, unknown>;
}) {
  const prisma = getPrisma();
  const existing = await prisma.controlOnboardingState.findUnique({
    where: { sessionId: params.sessionId },
  });
  const prev = (existing?.payload ?? {}) as Record<string, unknown>;
  const merged = { ...prev, ...(params.payload ?? {}) };
  const completionPct = completionForStep(params.step);

  const row = await prisma.controlOnboardingState.upsert({
    where: { sessionId: params.sessionId },
    create: {
      sessionId: params.sessionId,
      step: params.step,
      payload: merged,
      completionPct,
    },
    update: {
      step: params.step,
      payload: merged,
      completionPct,
    },
  });

  return {
    nextStep: row.step as OnboardingStep,
    completionPct: row.completionPct,
    payload: row.payload as Record<string, unknown>,
  };
}
