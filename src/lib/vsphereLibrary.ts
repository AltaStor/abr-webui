// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ (AltaStor.com)

/**
 * The server-wide VMware access as one of three choices, which Settings →
 * VMware offers (a new appliance starts on LibreVDDK; nothing asks at setup):
 *
 * - LibreVDDK, the default: the VDDK API with the library that comes with
 *   AltaStor (`vddk_library: "librevddk"`);
 * - VDDK: the VDDK API with VMware's own VDDK, named by the full path of its
 *   library (any other library file is named the same way);
 * - SOAP: the vSphere SOAP API, which loads no library.
 *
 * The appliance stores LibreVDDK as the full path of its library, and a
 * library that follows the VDDK directory as null; the second shows as VDDK
 * with the path it resolves to, so the field always says which file is in
 * use. Only what changed is sent, so saving the values as they are never
 * turns one into the other.
 */
import type { DetectedVddkLibrary, VsphereApi, VsphereSettings } from "@/types";

export type VmwareChoice = "libre" | "vddk" | "soap";

/** In the order they are offered, LibreVDDK first. */
export const VMWARE_CHOICES: readonly VmwareChoice[] = ["libre", "vddk", "soap"];

/** The word `vddk_library` takes for LibreVDDK's own library. */
export const LIBRE_VDDK = "librevddk";

/** The API a choice reads disks over. */
export const apiOfChoice = (choice: VmwareChoice): VsphereApi => (choice === "soap" ? "soap" : "vddk");

/** LibreVDDK's library when the appliance has it installed. */
export function libreVddkLibrary(settings: VsphereSettings): DetectedVddkLibrary | null {
  return settings.detectedLibraries.find((lib) => lib.kind === "librevddk") ?? null;
}

/** The libraries the appliance found besides LibreVDDK's: VMware VDDK
 *  bundles and libraries in the system's own folders. */
export function otherVddkLibraries(settings: VsphereSettings): DetectedVddkLibrary[] {
  return settings.detectedLibraries.filter((lib) => lib.kind !== "librevddk");
}

const strip = (p: string) => p.trim().replace(/\/+$/, "");

/** Whether the saved library is LibreVDDK's. */
export function usesLibreVddk(settings: VsphereSettings): boolean {
  const libre = libreVddkLibrary(settings);
  return libre !== null && settings.library !== null && strip(settings.library) === strip(libre.path);
}

/** The choice the saved values amount to. */
export function choiceOf(settings: VsphereSettings): VmwareChoice {
  if (settings.api === "soap") return "soap";
  return usesLibreVddk(settings) ? "libre" : "vddk";
}

/** The path of the saved library when it is not LibreVDDK's: the one named,
 *  or the VDDK directory's when it follows the directory. */
function savedPath(settings: VsphereSettings): string | null {
  return usesLibreVddk(settings) ? null : (settings.library ?? settings.defaultLibrary);
}

/** The path VDDK starts with: the saved library when it is not LibreVDDK's,
 *  else the first other library the appliance found, else nothing. */
export function vddkPathOf(settings: VsphereSettings): string {
  return savedPath(settings) ?? otherVddkLibraries(settings)[0]?.path ?? "";
}

/** What `vddk_library` gets for a choice, or undefined when it is as saved. */
export function libraryChange(choice: VmwareChoice, path: string, settings: VsphereSettings): string | undefined {
  if (choice === "soap") return undefined;
  if (choice === "libre") return usesLibreVddk(settings) ? undefined : LIBRE_VDDK;
  const text = path.trim();
  if (text === "" || text === savedPath(settings)?.trim()) return undefined;
  return text;
}

/** The library a choice loads, for the "in effect" line: null for SOAP, for
 *  LibreVDDK when it is not installed, and for VDDK without a path. */
export function libraryOfChoice(choice: VmwareChoice, path: string, settings: VsphereSettings): string | null {
  if (choice === "soap") return null;
  if (choice === "libre") return libreVddkLibrary(settings)?.path ?? null;
  return path.trim() || null;
}
