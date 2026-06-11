/** Shared motion tokens — mirror the redesign plan. */
export const MOTION = {
  instant: 0.1,
  fast: 0.18,
  base: 0.28,
  slow: 0.45,
  easeStandard: [0.16, 1, 0.3, 1] as const,
  easeExit: [0.4, 0, 1, 1] as const,
} as const;
