/**
 * Each brand (agua/bounce/centrd) is its own build, deployed on its own
 * domain, and points at its own database (MONGODB_URI/MONGODB_DB_NAME) -
 * mirroring how fog-mobile-app bakes in BRAND_ID per native build. So this
 * is a deployment-time constant, not a per-user attribute: every account in
 * this deployment's database belongs to this one brand.
 */
export const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? "";
