export default {
  providers: [
    {
      // Must match the Clerk instance encoded in VITE_CLERK_PUBLISHABLE_KEY,
      // otherwise Convex rejects every session token and the app shows
      // "Sign In" to users Clerk considers signed in.
      // Clerk development instance ins_35m6oA2za9kXbpXdjK302dnzwYa, the one
      // whose keys are in .env.local. Its "convex" JWT template is required.
      // This is the leanfoward.designs@gmail.com account
      domain: "https://sought-horse-8.clerk.accounts.dev",
      applicationID: "convex",
    },
    {
      // The live site (type-tracker.vercel.app) is built with this instance's
      // key and shares the dev Convex deployment, so both must be accepted.
      // Clerk app "My Application" (app_3JQw5fer23KCtYhpBlnIXt5O3Co),
      // development instance, owned by tobycrust@gmail.com.
      domain: "https://welcome-lemming-4924.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
