export default {
  providers: [
    {
      // Must match the Clerk instance encoded in VITE_CLERK_PUBLISHABLE_KEY,
      // otherwise Convex rejects every session token and the app shows
      // "Sign In" to users Clerk considers signed in.
      // Clerk app "My Application" (app_3JQw5fer23KCtYhpBlnIXt5O3Co),
      // development instance, owned by tobycrust@gmail.com.
      domain: "https://welcome-lemming-4924.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
