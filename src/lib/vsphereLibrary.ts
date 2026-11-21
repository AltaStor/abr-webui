// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The server-wide VDDK library as one field: empty is AltaVDDK, the library
 * that comes with AltaStor (the appliance calls it oVDDK); a full path is any
 * other library, VMware's own VDDK above all. Settings → VMware and the
 * choice after the first sign-in both read and write it this way.
 *
 * The appliance stores AltaVDDK as the full path of its library, and a
 * library that follows the VDDK directory as null. The field shows the first
 * as empty and the second as the path it resolves to, so it always says
 * which file is in use. Only a changed field is sent, so saving the values as
 * they are never turns one into the other.
 */
import type { DetectedVddkLibrary, VsphereSettings } from "@/types";

/** The word `vddk_library` takes for AltaVDDK's own library. */
export const ALTA_VDDK = "ovddk";

const same = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a) && Boolean(b) && a!.replace(/\/+$/, "") === b!.replace(/\/+$/, "");

/** AltaVDDK's library when the appliance has it installed. */
export function altaVddkLibrary(settings: VsphereSettings): DetectedVddkLibrary | null {
  return settings.detectedLibraries.find((lib) => lib.kind === "ovddk") ?? null;
}

/** Whether the saved library is AltaVDDK's. */
export function usesAltaVddk(settings: VsphereSettings): boolean {
  const alta = altaVddkLibrary(settings);
  return alta !== null && same(settings.library, alta.path);
}

/** The field as the saved values fill it: empty for AltaVDDK, otherwise the
 *  path of the library in use. */
export function libraryFieldOf(settings: VsphereSettings): string {
  if (usesAltaVddk(settings)) return "";
  return settings.library ?? settings.defaultLibrary;
}

/** What `vddk_library` gets for the field, or undefined when it is as saved. */
export function libraryChange(field: string, settings: VsphereSettings): string | undefined {
  const text = field.trim();
  if (text === libraryFieldOf(settings).trim()) return undefined;
  return text === "" ? ALTA_VDDK : text;
}

/** The library a field names, for the "in effect" line: AltaVDDK's when it
 *  is empty, null when it is empty and AltaVDDK is not installed. */
export function libraryOfField(field: string, settings: VsphereSettings): string | null {
  const text = field.trim();
  if (text !== "") return text;
  return altaVddkLibrary(settings)?.path ?? null;
}
