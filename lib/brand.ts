/**
 * Each brand (agua/bounce/centrd) is its own build, deployed on its own
 * domain, and points at its own database (MONGODB_URI/MONGODB_DB_NAME) -
 * mirroring how fog-mobile-app bakes in BRAND_ID per native build. So this
 * is a deployment-time constant, not a per-user attribute: every account in
 * this deployment's database belongs to this one brand.
 *
 * Server-only: nothing in the browser bundle reads this, so it's plain
 * BRAND_ID rather than NEXT_PUBLIC_BRAND_ID - no reason to ship it to clients.
 */
export const BRAND_ID = process.env.BRAND_ID ?? "";
