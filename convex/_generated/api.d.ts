/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as config from "../config.js";
import type * as dataHelpers from "../dataHelpers.js";
import type * as http from "../http.js";
import type * as imagePacks from "../imagePacks.js";
import type * as images from "../images.js";
import type * as migrations from "../migrations.js";
import type * as openrouter from "../openrouter.js";
import type * as postbridge from "../postbridge.js";
import type * as projects from "../projects.js";
import type * as slideshows from "../slideshows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  auth: typeof auth;
  authz: typeof authz;
  config: typeof config;
  dataHelpers: typeof dataHelpers;
  http: typeof http;
  imagePacks: typeof imagePacks;
  images: typeof images;
  migrations: typeof migrations;
  openrouter: typeof openrouter;
  postbridge: typeof postbridge;
  projects: typeof projects;
  slideshows: typeof slideshows;
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
