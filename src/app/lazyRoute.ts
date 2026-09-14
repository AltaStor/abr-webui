// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Route-level code splitting that survives an appliance upgrade.
 *
 * Every page in the console is a separate hashed chunk (`CreateJobPage-<hash>.js`)
 * that the browser only fetches when the route is first visited. The file name
 * carries a content hash, so an upgrade replaces the whole `assets/` directory
 * with a set of *differently named* files — and a tab that was opened before
 * the upgrade still holds the old module graph, pointing at names the appliance
 * no longer has.
 *
 * Asking for one of those produces the crash this module exists to prevent:
 * `/assets/CreateJobPage-CA19GkLe.js` misses the `/assets` StaticFiles mount,
 * FastAPI's 404 handler answers `{"detail":"Not Found"}` as `application/json`,
 * and the browser refuses to run a module served with that type —
 * "Loading module from … was blocked because of a disallowed MIME type". The
 * import rejects, the rejection reaches the router's `errorElement`, and the
 * operator gets "This view hit a snag" on a console that is merely out of date.
 *
 * It reads as flaky because it is invisible until someone opens a route they
 * hadn't opened before: the pages already in memory keep working, so a tab can
 * sit healthy for hours and then fail the moment it needs a new chunk.
 *
 * The recovery is two-stage, because the same rejection covers two different
 * failures that want opposite responses:
 *
 *  1. A transient fetch failure (dropped Wi-Fi, appliance mid-restart). The
 *     asset is still there — retrying the same import a moment later works.
 *  2. A stale module graph after an upgrade. Retrying can never work; the file
 *     is gone. Only a document reload gets the new `index.html` and, with it,
 *     the new asset names.
 *
 * So: retry once, and if that fails too, reload the document — once, guarded by
 * a sessionStorage stamp, so a genuinely broken deploy (assets missing for
 * everyone, not just this tab) degrades to the error screen instead of pinning
 * the browser in a reload loop.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** The prop type `React.lazy` itself is declared with. Route components have
 *  unrelated prop shapes (`CreateJobPage` takes a `kind`, most take nothing),
 *  so the wrapper has to stay as open as the function it forwards to — pinning
 *  it to `never` makes every page with props unassignable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;

/** How long to wait before the single retry — long enough for a dropped
 *  connection or a restarting appliance to come back, short enough that a
 *  route the operator clicked still feels like it is loading. */
const RETRY_DELAY_MS = 500;

/** sessionStorage key holding the timestamp of our last recovery reload. */
const RELOAD_STAMP_KEY = "basalt.chunkReloadAt";

/** A reload inside this window is treated as "we already tried that" — the
 *  assets really are missing, so the next failure goes to the error screen
 *  rather than round-tripping the browser again. Comfortably longer than a
 *  reload + re-navigation, comfortably shorter than a session. */
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Does this rejection mean "the module could not be loaded", as opposed to the
 * module loading fine and throwing while it evaluated?
 *
 * The distinction matters: a real bug inside a page must reach the error screen
 * with its own message, not be papered over by a reload. Browsers disagree on
 * the wording, so all four families are matched — Chrome's "Failed to fetch",
 * Firefox's "error loading", Safari's "Importing a module script failed", and
 * the MIME-type refusal that this appliance's JSON 404 actually produces.
 */
export function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /dynamically imported module/i.test(message) ||
    /disallowed mime type/i.test(message) ||
    /failed to load module script/i.test(message)
  );
}

/** Whether we have already spent this session's one recovery reload. Storage
 *  being unavailable (private mode, storage disabled) is treated as "yes":
 *  without a way to remember the attempt, reloading risks an endless loop, and
 *  an honest error screen beats a browser that will not settle. */
function reloadAlreadyAttempted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stamp = Number(window.sessionStorage.getItem(RELOAD_STAMP_KEY));
    return Number.isFinite(stamp) && stamp > 0 && Date.now() - stamp < RELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

/** Record that we are about to reload, so the tab we come back as knows not to
 *  do it again. Written *before* the reload — after it, nothing runs. */
function markReloadAttempted(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
  } catch {
    /* storage disabled — reloadAlreadyAttempted() already refuses in that case */
  }
}

/**
 * Reload the document to pick up the current build, if we haven't already.
 *
 * Returns a promise that never settles on the reload path: the caller is a
 * `lazy()` factory, and resolving or rejecting it would flash a broken view (or
 * the error screen) over a page that is about to be replaced anyway. Returning
 * `false` means the reload was declined and the caller should surface the
 * original error.
 */
function reloadForNewBuild(): Promise<never> | false {
  if (typeof window === "undefined" || reloadAlreadyAttempted()) return false;
  markReloadAttempted();
  window.location.reload();
  return new Promise<never>(() => {});
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run a dynamic import with the retry-then-reload recovery described above.
 *
 * Exported for the router's `lazyRoute`, and usable directly by any other
 * `import()` that must not take the console down when a chunk goes missing.
 */
export async function importWithRecovery<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (firstError) {
    // A page that loaded and then threw is a real bug. Let it through
    // untouched so the error screen names it.
    if (!isModuleLoadError(firstError)) throw firstError;

    await sleep(RETRY_DELAY_MS);
    try {
      return await factory();
    } catch (secondError) {
      if (!isModuleLoadError(secondError)) throw secondError;
      // Twice is not a blip. Either this tab is holding a module graph the
      // appliance has replaced, or the assets are gone for good; the reload
      // distinguishes them, and its guard makes sure we only ask once.
      const reloading = reloadForNewBuild();
      if (reloading) return reloading;
      throw secondError;
    }
  }
}

/**
 * `React.lazy` for route components, with chunk-load recovery.
 *
 * Drop-in for `lazy(() => import("..."))` — same signature, same Suspense
 * behaviour, minus the upgrade-shaped crash.
 */
export function lazyRoute<T extends ComponentType<AnyProps>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithRecovery(factory));
}

/**
 * Catch the *other* way a stale chunk surfaces: Vite's `<link rel="modulepreload">`
 * warm-up for a route's dependencies. Those failures are reported through the
 * `vite:preloadError` event rather than the import's own rejection, and the
 * default behaviour is to rethrow — which would take the console down before
 * `importWithRecovery` ever saw it.
 *
 * Calling `preventDefault()` hands the failure back to the import that triggered
 * the preload, where the retry-then-reload path handles it properly.
 *
 * Installed from `main.tsx`, once, before the first render.
 */
export function installModulePreloadRecovery(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
  });
}
