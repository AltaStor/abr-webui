// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCcw, Rocket } from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { apiErrorCode, apiErrorMessage } from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import type { RestorePoint, VM } from "@/types";
import { RestoreStepper, type StepDef } from "./components/RestoreStepper";
import { ChooseVmStep } from "./components/ChooseVmStep";
import { ChoosePointStep } from "./components/ChoosePointStep";
import { RestoreEncryptionKey } from "./components/RestoreEncryptionKey";
import {
  ChooseModeStep,
  validateRestoredVmName,
  type NetworkMapping,
  type RestoreDestination,
} from "./components/ChooseModeStep";
import {
  classifyRestoreFailure,
  crossHypervisorRestoreBlocked,
  refusalKey,
  type RestoreRefusal,
} from "./refusals";
import { RESTORE_POINT_PARAM, RESTORE_VM_PARAM } from "./link";

export default function RestorePage() {
  const { t } = useTranslation("restore");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectVmId = searchParams.get(RESTORE_VM_PARAM);
  /* Optional companion to ?vm=, written by every "Restore" affordance that has
   * a point in hand (see restoreLink). It selects the restore point the
   * operator actually picked, so the wizard stops substituting the newest one
   * underneath them — and `startRestore` therefore sends that point's id. */
  const preselectPointId = searchParams.get(RESTORE_POINT_PARAM);

  const STEPS: StepDef[] = [
    { id: 1, label: t("steps.source.label") },
    { id: 2, label: t("steps.point.label") },
    { id: 3, label: t("steps.recover.label") },
  ];

  const vms = useWorldStore((s) => s.vms);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const repositories = useWorldStore((s) => s.repositories);
  const environments = useWorldStore((s) => s.environments);
  const startRestore = useWorldStore((s) => s.startRestore);

  const offlineRepoIds = useMemo(
    () => new Set(repositories.filter((r) => r.status === "offline").map((r) => r.id)),
    [repositories],
  );
  /** Newest restore point for a VM whose repository is reachable — so we never
   *  auto-select (and strand the wizard on) a point sitting on offline storage. */
  const latestRestorablePoint = (targetVmId: string): RestorePoint | null => {
    const forVm = restorePoints
      .filter((p) => p.vmId === targetVmId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return forVm.find((p) => !offlineRepoIds.has(p.repositoryId)) ?? null;
  };

  const [step, setStep] = useState(1);
  const [vm, setVm] = useState<VM | null>(null);
  const [point, setPoint] = useState<RestorePoint | null>(null);
  const [destination, setDestination] = useState<RestoreDestination>("original");
  const [targetEnvId, setTargetEnvId] = useState("");
  const [newName, setNewName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [nameConflict, setNameConflict] = useState(false);
  const [nameSubmitError, setNameSubmitError] = useState<string | undefined>(undefined);
  const [targetHostId, setTargetHostId] = useState("");
  const [datastore, setDatastore] = useState("");
  // What "Automatic" resolves to for the target currently chosen, reported by
  // ChooseModeStep so the request can name it outright — see its
  // onAutoPlacementChange.
  const [autoPlacement, setAutoPlacement] = useState({ hostId: "", datastore: "" });
  const [networkMappings, setNetworkMappings] = useState<NetworkMapping[]>([]);
  const [powerOn, setPowerOn] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  /* Never persisted and never sent unless typed: an empty key means "let the
   * appliance resolve its own", which is the normal path. */
  const [encryptionKey, setEncryptionKey] = useState("");
  /* Set once the appliance has refused the restore for want of a key, which is
   * what turns the field from an option into the only way forward. */
  const [keyRequired, setKeyRequired] = useState(false);

  // Changing the target environment invalidates any host chosen in the old one.
  const onTargetEnvChange = (id: string) => {
    setTargetEnvId(id);
    setTargetHostId("");
  };

  // Auto-advance when the page is deep-linked with ?vm=<id> (2-click restore).
  const handledPreselect = useRef(false);
  useEffect(() => {
    if (handledPreselect.current || !preselectVmId) return;
    const target = vms.find((v) => v.id === preselectVmId);
    if (!target) return;
    handledPreselect.current = true;
    if (target.restorePointCount === 0 || target.protection === "unprotected") {
      // Still let the user see why — drop them on step 2 with the VM chosen.
      setVm(target);
      setStep(2);
      return;
    }
    /* An explicitly named point wins over "newest". It still has to belong to
     * this VM and sit on reachable storage — a stale link or a since-deleted
     * point falls back to the normal newest-restorable choice rather than
     * stranding the wizard on nothing. */
    const named = preselectPointId
      ? restorePoints.find(
          (p) =>
            p.id === preselectPointId &&
            p.vmId === target.id &&
            !offlineRepoIds.has(p.repositoryId),
        )
      : undefined;
    const chosen = named ?? latestRestorablePoint(target.id);
    setVm(target);
    setPoint(chosen);
    // Preselect VM + a restorable point → jump straight to confirm. If every
    // point is on offline storage, stay on step 2 so the wizard shows why.
    setStep(chosen ? 3 : 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectVmId, preselectPointId, vms, restorePoints, offlineRepoIds]);

  // Default-select the most recent restore point whenever a VM is chosen.
  const vmId = vm?.id;
  useEffect(() => {
    if (!vmId) return;
    setPoint((prev) => {
      if (prev && prev.vmId === vmId) return prev;
      return latestRestorablePoint(vmId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmId, restorePoints, offlineRepoIds]);

  const onSelectVm = (next: VM) => {
    setVm(next);
    // Select the most recent point up front so step 2 lands with a choice made
    // and Continue enabled — matching the "most recent is selected for you" copy.
    // (Done synchronously here rather than leaning on the post-render effect,
    // which didn't fire reliably against the live store.)
    setPoint(latestRestorablePoint(next.id));
    setStep(2);
  };

  const onSelectPoint = (p: RestorePoint) => {
    setPoint(p);
  };

  // A name the appliance already rejected is stale the moment the user
  // touches the field again — clear it rather than showing a fixed error
  // next to an edited value.
  const onNewNameChange = (name: string) => {
    setNewName(name);
    setNameSubmitError(undefined);
  };

  const resetWizard = () => {
    setStep(1);
    setVm(null);
    setPoint(null);
    setDestination("original");
    setTargetEnvId("");
    setNewName("");
    setNameTouched(false);
    setNameConflict(false);
    setNameSubmitError(undefined);
    setTargetHostId("");
    setDatastore("");
    setNetworkMappings([]);
    setPowerOn(false);
    setOverwriteConfirmed(false);
    setEncryptionKey("");
    setKeyRequired(false);
  };

  /* ----------------------------- step gating ----------------------------- */
  const canContinue = useMemo(() => {
    if (step === 1) return !!vm;
    if (step === 2) return !!point;
    return false;
  }, [step, vm, point]);

  // "Original location" only overwrites something when the source VM still
  // exists there (step 1 only lists currently-live VMs, so this is true
  // whenever the chosen VM hasn't since been deleted out from under the
  // wizard). The appliance restores in place by building a fully verified
  // replacement first, then destroying this VM and renaming the replacement
  // into place — irreversible, so it requires the typed confirmation below
  // before it can be authorized. When the VM is no longer live, "original
  // location" just recreates it under its own name/host/datastore — a plain
  // new_vm restore, no confirmation needed.
  const originalLocationOverwrite = destination === "original" && !!vm && vms.some((v) => v.id === vm.id);

  // Reset the typed confirmation whenever the thing it's confirming changes
  // underneath the user, so a stale "yes, overwrite" never survives a VM or
  // destination switch.
  useEffect(() => {
    setOverwriteConfirmed(false);
  }, [vm?.id, destination]);

  /* This appliance ships one hypervisor plugin (vCenter), so it can neither
   * create the VM on another platform nor convert its disks for one. The
   * wizard can still OFFER such a target — Hyper-V and Proxmox inventories
   * register and scan — so the refusal has to happen here, on the step that
   * offers it, instead of after a typed confirmation. See
   * `crossHypervisorRestoreBlocked`. */
  const crossHypervisorBlocked = useMemo(() => {
    if (destination !== "new-location" || !vm || !targetEnvId) return false;
    return crossHypervisorRestoreBlocked(
      environments.find((e) => e.id === vm.environmentId)?.hypervisor,
      environments.find((e) => e.id === targetEnvId)?.hypervisor,
    );
  }, [destination, vm, targetEnvId, environments]);

  const canStart = useMemo(() => {
    if (!vm || !point) return false;
    if (destination === "new-location") {
      if (crossHypervisorBlocked) return false;
      return !!targetEnvId && !validateRestoredVmName(newName) && !nameConflict;
    }
    return !originalLocationOverwrite || overwriteConfirmed;
  }, [vm, point, destination, targetEnvId, newName, nameConflict, originalLocationOverwrite, overwriteConfirmed, crossHypervisorBlocked]);

  /* One refusal, one toast: a console-owned headline that names what was
   * refused, the console's own explanation, and — only underneath both — the
   * appliance's own sentence, which arrives as UI-ready English the console
   * doesn't own and must not present as its verdict. */
  const showRefusal = (refusal: RestoreRefusal, detail?: string | null) => {
    toast.error(t(refusalKey(refusal, "title")), {
      description: (
        <span className="block">
          {t(refusalKey(refusal, "desc"))}
          {detail && <span className="mt-1 block">{detail}</span>}
        </span>
      ),
    });
  };

  // Runs the actual mutation + toast + navigate.
  const performRestore = async () => {
    if (!vm || !point || !canStart) return;
    setNameSubmitError(undefined);
    try {
      const sessionId = await startRestore({
        vmId: vm.id,
        vmName: vm.name,
        restorePointId: point.id,
        destination,
        targetEnvId: destination === "new-location" ? targetEnvId : undefined,
        // "Original location" restores under the VM's real name — it's the
        // only way that destination means anything — while "New location"
        // falls back to the appliance's own "<source>-restored" default.
        newName: destination === "new-location" ? newName.trim() || undefined : vm.name,
        // Send the placement the wizard showed, Automatic included: the
        // appliance's own fallback defaults were resolved against the restore
        // point's environment, so they name the wrong host for any other one.
        targetHostId:
          destination === "new-location" ? targetHostId || autoPlacement.hostId || undefined : undefined,
        datastore:
          destination === "new-location"
            ? datastore.trim() || autoPlacement.datastore || undefined
            : undefined,
        networkMappings:
          destination === "new-location" ? networkMappings.filter((m) => m.target.trim()) : undefined,
        powerOn: destination === "new-location" ? powerOn : undefined,
        force: destination === "original" ? overwriteConfirmed : undefined,
        encryptionKey: encryptionKey.trim() || undefined,
      });
      if (!sessionId) {
        // The appliance answered 2xx but named no restore session, so nothing
        // is running. Say exactly that rather than guessing at a cause.
        showRefusal("noSession");
        return;
      }
      toast.success(t("toast.started.title"), {
        description: t("toast.started.desc", { name: vm.name }),
      });
      navigate("/activity");
    } catch (err) {
      // A name collision on a New-location restore is shown right next to the
      // field that caused it; on Original location there's no name field to
      // anchor it to (the proactive check above should have already caught
      // it), so it goes through the classifier like every other refusal.
      if (destination === "new-location" && apiErrorCode(err) === "target_vm_exists") {
        setNameSubmitError(apiErrorMessage(err) ?? t("mode.restoredVmNameError.duplicate"));
        return;
      }
      const { refusal, detail } = classifyRestoreFailure(err);
      // Open the key field and keep the wizard where it is: the operator has
      // an escrowed key to fetch, not a different restore to configure.
      if (refusal === "encryptionKeyUnavailable") setKeyRequired(true);
      showRefusal(refusal, detail);
    }
  };

  const handleStart = () => {
    if (!vm || !point || !canStart) return;
    performRestore();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          step > 1 ? (
            <Button variant="ghost" onClick={resetWizard} className="text-muted-foreground">
              <RotateCcw className="h-4 w-4" />
              {t("actions.startOver")}
            </Button>
          ) : undefined
        }
      />

      <RestoreStepper steps={STEPS} current={step} onStepClick={(id) => setStep(id)} />

      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {step === 1 && <ChooseVmStep onSelect={onSelectVm} />}
            {step === 2 && vm && (
              <ChoosePointStep vm={vm} selectedId={point?.id ?? null} onSelect={onSelectPoint} />
            )}
            {step === 3 && vm && point && (
              <ChooseModeStep
                vm={vm}
                point={point}
                destination={destination}
                onDestinationChange={setDestination}
                targetEnvId={targetEnvId}
                onTargetEnvChange={onTargetEnvChange}
                newName={newName}
                onNewNameChange={onNewNameChange}
                nameTouched={nameTouched}
                onNameBlur={() => setNameTouched(true)}
                onNameConflictChange={setNameConflict}
                nameSubmitError={nameSubmitError}
                targetHostId={targetHostId}
                onTargetHostIdChange={setTargetHostId}
                datastore={datastore}
                onDatastoreChange={setDatastore}
                onAutoPlacementChange={setAutoPlacement}
                networkMappings={networkMappings}
                onNetworkMappingsChange={setNetworkMappings}
                powerOn={powerOn}
                onPowerOnChange={setPowerOn}
                originalLocationOverwrite={originalLocationOverwrite}
                onOverwriteConfirmedChange={setOverwriteConfirmed}
              />
            )}
            {/* Only for a point that is, or might be, encrypted: `encrypted` is
                null on catalog entries written before the appliance recorded
                it, and offering the field is better than assuming it is in the
                clear (see RestorePoint.encrypted). */}
            {step === 3 && point && point.encrypted !== false && (
              <div className="mt-4">
                <RestoreEncryptionKey
                  value={encryptionKey}
                  onChange={(v) => {
                    setEncryptionKey(v);
                    // A typed key makes the previous refusal stale.
                    setKeyRequired(false);
                  }}
                  required={keyRequired}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action bar */}
      {step > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))}>
            <ArrowLeft className="h-4 w-4" />
            {t("common:actions.back")}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              {t("actions.continue")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleStart} disabled={!canStart}>
              <Rocket className="h-4 w-4" />
              {t("cta.startRestore")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
