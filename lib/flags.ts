/** Feature flags. Likelihood scores stay off until seat history is verified. */
export const FEATURES = {
  likelihood: process.env.NEXT_PUBLIC_FEATURE_LIKELIHOOD === "true",
};
