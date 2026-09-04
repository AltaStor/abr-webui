// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Cross-hypervisor restore planning.
 *
 * ORPHANED, deliberately kept. Nothing in this repository imports it: its one
 * consumer was the restore wizard's conversion-plan card, which was removed
 * because the plan it drew was a client-side guess for a conversion this
 * orchestrator cannot perform — one hypervisor plugin
 * (`python/srv/plugins/vcenter`), no disk-format conversion, no driver
 * injection. The wizard now refuses a cross-platform target instead of
 * promising one (see features/restore/refusals.ts).
 *
 * The algorithm is left in place as the reference for whoever builds the real
 * thing; it costs nothing at runtime, since an unimported module is dropped
 * from the bundle. Its previous header claimed the appliance imported this
 * file by relative path — true of the Node control plane in the other
 * appliance line, never of the Python orchestrator here.
 */
import type {
  ConversionConfidence,
  ConversionPlan,
  ConversionStep,
  DiskFormat,
  Hypervisor,
  OsFamily,
} from "../types";

/** Each platform's native virtual-disk format. */
export function platformFormat(h: Hypervisor): DiskFormat {
  switch (h) {
    case "hyperv":
      return "vhdx";
    case "vmware":
      return "vmdk";
    case "proxmox":
      return "qcow2";
  }
}

export function platformLabel(h: Hypervisor): string {
  switch (h) {
    case "hyperv":
      return "Hyper-V";
    case "vmware":
      return "VMware";
    case "proxmox":
      return "Proxmox";
  }
}

/** Firmware a guest most likely uses — modern guests are UEFI, older ones BIOS. */
function guessFirmware(guestOs: string | undefined): "bios" | "uefi" {
  const g = (guestOs ?? "").toLowerCase();
  if (/2008|2012|windows 7|windows xp|centos 6|rhel 6|debian 7|debian 8/.test(g)) return "bios";
  return "uefi";
}

function driverStrategyFor(osFamily: OsFamily): { strategy: string; confidence: ConversionConfidence } {
  switch (osFamily) {
    case "linux":
      return {
        strategy:
          "Linux guests ship in-tree paravirtual drivers (virtio, Hyper-V hv_vmbus, VMware pvscsi/vmxnet). The kernel re-detects the target platform's virtual hardware on boot, so the guest comes up unmodified.",
        confidence: "high",
      };
    case "windows":
      return {
        strategy:
          "Windows needs its boot-critical storage + NIC drivers present before it boots on new hardware. AltaStor injects the target platform's drivers into the offline image and marks them boot-start; Windows completes device setup on first boot.",
        confidence: "medium",
      };
    default:
      return {
        strategy:
          "Guest OS couldn't be determined — a generic driver set is injected. Verify the guest boots and its network comes up after conversion.",
        confidence: "low",
      };
  }
}

/**
 * Compute the conversion plan for restoring a guest from `source` onto `target`.
 * When the platforms match it's a same-platform restore (crossPlatform: false).
 */
export function computeConversionPlan(
  source: Hypervisor,
  target: Hypervisor,
  osFamily: OsFamily,
  guestOs?: string,
): ConversionPlan {
  const sourceFormat = platformFormat(source);
  const targetFormat = platformFormat(target);
  const formatChange = sourceFormat !== targetFormat;
  const crossPlatform = source !== target;
  const firmware = guessFirmware(guestOs);
  const { strategy, confidence } = driverStrategyFor(osFamily);

  const steps: ConversionStep[] = [
    {
      key: "reconstruct",
      label: "Reconstruct disk image",
      detail: "Rebuild the guest's virtual disk from the restore point.",
    },
  ];
  if (formatChange) {
    steps.push({
      key: "convert-format",
      label: `Convert ${sourceFormat.toUpperCase()} → ${targetFormat.toUpperCase()}`,
      detail: `Re-encode the disk to ${platformLabel(target)}'s native format with qemu-img.`,
    });
  }
  if (crossPlatform) {
    steps.push({
      key: "adapt-guest",
      label: `Adapt guest for ${platformLabel(target)}`,
      detail:
        osFamily === "windows"
          ? "Inject boot-critical drivers into the offline image and set them boot-start."
          : "Confirm the guest's paravirtual drivers cover the target platform.",
    });
  }
  steps.push({
    key: "provision",
    label: `Register on ${platformLabel(target)}`,
    detail: `Create the VM on ${platformLabel(target)} and attach the converted disk.`,
  });

  const warnings: string[] = [];
  if (crossPlatform && osFamily === "windows") {
    warnings.push("Windows may require reactivation and a first-boot device setup after moving platforms.");
  }
  if (crossPlatform && osFamily === "unknown") {
    warnings.push("The guest OS is unknown — boot behavior on the new platform can't be guaranteed.");
  }

  return {
    crossPlatform,
    sourcePlatform: source,
    targetPlatform: target,
    sourceFormat,
    targetFormat,
    formatChange,
    firmware,
    osFamily,
    driverStrategy: strategy,
    confidence,
    steps,
    warnings,
  };
}
