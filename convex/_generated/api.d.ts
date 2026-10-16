/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as billing from "../billing.js";
import type * as customCategories from "../customCategories.js";
import type * as entitlements from "../entitlements.js";
import type * as http from "../http.js";
import type * as mistakes from "../mistakes.js";
import type * as quoteSimilarity from "../quoteSimilarity.js";
import type * as raceQuotes from "../raceQuotes.js";
import type * as races from "../races.js";
import type * as storedQuotes from "../storedQuotes.js";
import type * as stripe from "../stripe.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  billing: typeof billing;
  customCategories: typeof customCategories;
  entitlements: typeof entitlements;
  http: typeof http;
  mistakes: typeof mistakes;
  quoteSimilarity: typeof quoteSimilarity;
  raceQuotes: typeof raceQuotes;
  races: typeof races;
  storedQuotes: typeof storedQuotes;
  stripe: typeof stripe;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
