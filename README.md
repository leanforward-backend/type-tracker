# Type Tracker

## Payments (Stripe)

> **Warning: payments are in Stripe test mode, including on the live site.**
> https://type-tracker.vercel.app uses the dev Convex deployment
> (`efficient-pony-114`), which has the `sk_test_` key. Anyone can check out
> with the test card `4242 4242 4242 4242` and get Pro or the lifetime pack
> for free, and no real payments can be taken. Before launch: point Vercel at
> a production Convex deployment and run
> `node scripts/setup-stripe.mjs --prod --convex-site https://<prod>.convex.site --site-url https://type-tracker.vercel.app`
> with an `sk_live_` key.

Stripe is configured entirely through Convex env vars (see the top of
`convex/stripe.ts`); `.env.local` needs no Stripe keys.
`scripts/setup-stripe.mjs` creates the prices, webhook and billing portal
through the API and sets those vars. Checkout returns people to the site they
came from if it is `SITE_URL` or listed in `OTHER_SITE_URLS`, otherwise to
`SITE_URL`.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
