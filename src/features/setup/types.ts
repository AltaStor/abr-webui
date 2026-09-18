// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Shared state for the first-boot Initial Configuration wizard — the web
 * counterpart of the appliance DCUI. One flat form object feeds every step;
 * `buildManifest` folds it into the day-0 ApplianceManifest that the control
 * plane's zod schema (applianceManifestSchema) accepts verbatim.
 */
import { isValidResourceName } from "@/lib/resource-name";
import type { ApplianceManifest } from "@/services/api.http";
import type { EnvironmentType } from "@/types";
import i18n from "@/i18n";

const STEP_KEYS = [
  "welcome",
  "appliance",
  "storage",
  "repository",
  "hypervisors",
  "review",
  "apply",
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

/** `label` is a getter so it resolves through i18next at access time. */
export const STEPS: ReadonlyArray<{ key: StepKey; label: string }> = STEP_KEYS.map((key) => ({
  key,
  get label() {
    return i18n.t(`setup:steps.${key}`);
  },
}));

export function stepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key);
}

/** RFC 1123-ish label: letters, digits, hyphens — at most 63 characters. */
export const HOSTNAME_RE = /^[a-z0-9-]{1,63}$/i;

export interface HypervisorRow {
  /** Local list key — never leaves the browser. */
  id: string;
  type: EnvironmentType;
  endpoint: string;
  username: string;
  credentialRef: string;
}

let rowSeq = 0;
export function emptyHypervisorRow(): HypervisorRow {
  rowSeq += 1;
  return { id: `hv-${rowSeq}`, type: "vcenter", endpoint: "", username: "", credentialRef: "" };
}

export interface SetupForm {
  hostname: string;
  repoName: string;
  encryption: boolean;
  hypervisors: HypervisorRow[];
}

export function defaultForm(): SetupForm {
  return {
    hostname: "",
    repoName: "Hardened Repository",
    encryption: true,
    hypervisors: [emptyHypervisorRow()],
  };
}

/** A row the user never touched — silently dropped from the manifest. */
export function isBlankRow(row: HypervisorRow): boolean {
  return !row.endpoint.trim() && !row.username.trim() && !row.credentialRef.trim();
}

/** A row that can go into the manifest as-is. */
export function isCompleteRow(row: HypervisorRow): boolean {
  return (
    row.endpoint.trim().length > 0 &&
    row.username.trim().length > 0 &&
    row.credentialRef.trim().length > 0
  );
}

/** Per-step gate for the Continue button (storage is gated by the plan fetch, in the page). */
export function stepValid(step: StepKey, form: SetupForm): boolean {
  switch (step) {
    case "appliance":
      return HOSTNAME_RE.test(form.hostname.trim());
    case "repository":
      return isValidResourceName(form.repoName);
    case "hypervisors":
      return form.hypervisors.every((r) => isBlankRow(r) || isCompleteRow(r));
    default:
      return true;
  }
}

/** Fold the wizard form into the manifest the appliance applies verbatim. */
export function buildManifest(form: SetupForm): ApplianceManifest {
  return {
    hostname: form.hostname.trim(),
    network: { mode: "dhcp" },
    storage: { layout: "auto" },
    repository: {
      // Sent as typed — `stepValid` has already rejected surrounding whitespace,
      // so there is nothing here to trim away (see src/lib/resource-name.ts).
      name: form.repoName,
      encryption: form.encryption,
    },
    hypervisors: form.hypervisors.filter(isCompleteRow).map((r) => ({
      type: r.type,
      endpoint: r.endpoint.trim(),
      username: r.username.trim(),
      credentialRef: r.credentialRef.trim(),
    })),
    defaultPolicy: null,
  };
}

/** `label` values are getters resolving through i18next at access time. */
export const HYPERVISOR_LABEL: Record<EnvironmentType, string> = {
  get vcenter() {
    return i18n.t("setup:hypervisorTypes.vcenter");
  },
  get "esxi-standalone"() {
    return i18n.t("setup:hypervisorTypes.esxi-standalone");
  },
  get hyperv() {
    return i18n.t("setup:hypervisorTypes.hyperv");
  },
  get proxmox() {
    return i18n.t("setup:hypervisorTypes.proxmox");
  },
};
