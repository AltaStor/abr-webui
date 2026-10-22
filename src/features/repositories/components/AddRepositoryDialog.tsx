// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Wifi } from "@/lib/icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatStorage } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { ImmutabilityEffect, RepositoryType, S3ConnectionCheck, S3ConnectionTestResult } from "@/types";
import {
  RESOURCE_NAME_MAX_LENGTH,
  resourceNameErrorKey,
  resourceNameProblem,
} from "@/lib/resource-name";
import { REPO_TYPE_META } from "./repoMeta";
import { ImmutabilityFields } from "./ImmutabilityFields";
import { ValidationResultPanel } from "./ValidationResultPanel";
import { ShareFields } from "./ShareFields";
import { draftToShare, EMPTY_SHARE_DRAFT, shareDraftProblem, type ShareDraft } from "./share";
import {
  CREATE_LOCK_DAYS,
  DEFAULT_LOCK_MODE,
  draftToImmutability,
  draftValid,
  type ImmutabilityDraft,
} from "./immutability";
import { useCan } from "@/store/permissions";

/**
 * The only two backends the orchestrator can create: `createRepository` maps
 * the console type onto the wire type, and only "s3" and "local" have a
 * complete form here. "nfs" is on the wire but has no share/credential fields
 * in this dialog, and "hardened-immutable" has no wire type at all — it would
 * be sent as a plain "local" and read straight back as one.
 */
const TYPE_OPTIONS = ["object-lock-s3", "local"] as const satisfies readonly RepositoryType[];
type OfferedRepositoryType = (typeof TYPE_OPTIONS)[number];

/** Keyed on what's actually offered — a placeholder for a type the dialog
 *  can't create is dead text that outlives the reason it was written. */
const PATH_PLACEHOLDER: Record<OfferedRepositoryType, string> = {
  "object-lock-s3": "s3://your-bucket-name",
  local: "/var/vault/backups",
};

/** Local storage has no way to report real capacity up front — the appliance
 *  reads it from the filesystem once the repository exists — so creation
 *  just seeds a placeholder that gets replaced on the first scan. */
const LOCAL_DEFAULT_CAPACITY_GB = 500;

/** The S3 fields the appliance refuses a create without. The endpoint is
 *  deliberately absent: it is optional on the wire, so flagging it as missing
 *  would be the console inventing a requirement of its own. */
type S3RequiredField = "bucket" | "region" | "accessKey" | "secretKey";

/** Same test the orchestrator runs on `endpoint_url` — an http(s) scheme and a
 *  host — so a URL this accepts is one the appliance will take too. */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host !== "";
  } catch {
    return false;
  }
}

/** "Add repository", for a role that may add one. */
export function AddRepositoryDialog() {
  const canCreate = useCan("repository.create");
  return canCreate ? <AddRepositoryDialogBody /> : null;
}

function AddRepositoryDialogBody() {
  const { t } = useTranslation("repositories");
  const { t: tCommon } = useTranslation("common");
  const createRepository = useWorldStore((s) => s.createRepository);
  const testS3Connection = useWorldStore((s) => s.testS3Connection);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<OfferedRepositoryType>("object-lock-s3");
  const [path, setPath] = useState("");
  const [shareDraft, setShareDraft] = useState<ShareDraft>(EMPTY_SHARE_DRAFT);
  const [submitting, setSubmitting] = useState(false);

  // S3 connection settings — only used when type is "object-lock-s3".
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [region, setRegion] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [verifyTls, setVerifyTls] = useState(true);
  // Object Lock. Off by default: it makes backups undeletable for the whole
  // period, which is a bill and a commitment nobody should acquire by accident.
  const [lock, setLock] = useState<ImmutabilityDraft>({
    enabled: false,
    mode: DEFAULT_LOCK_MODE,
    days: CREATE_LOCK_DAYS,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<S3ConnectionTestResult | null>(null);
  /* What the appliance said when it refused the create. Its 422 for an unusable
   * Object Lock configuration carries the individual probes that failed, and
   * those are the actionable part — "the bucket has no Object Lock" and "the
   * bucket's own default rule is stronger than what you asked for" need
   * completely different fixes. */
  const [createError, setCreateError] = useState<{ message: string; checks: S3ConnectionCheck[] } | null>(null);
  // A required field is only *wrong* once the operator has been to it and left
  // it empty. Without this the dialog opened with the bucket already outlined
  // in red and a refusal underneath it, before anything had been asked for.
  const [touched, setTouched] = useState<Partial<Record<S3RequiredField, boolean>>>({});
  const touch = (field: S3RequiredField) => () => setTouched((prev) => ({ ...prev, [field]: true }));
  // Same courtesy for the endpoint, which is never "missing" but can be
  // malformed: half a URL is what every URL looks like mid-keystroke, so the
  // complaint waits until the operator has left the field.
  const [endpointTouched, setEndpointTouched] = useState(false);

  const isS3 = type === "object-lock-s3";
  const bucketValid = bucket.trim().length > 0;
  const regionValid = region.trim().length > 0;
  const accessKeyValid = accessKey.trim().length > 0;
  const secretKeyValid = secretKey.length > 0;
  // Optional on the wire — an endpoint is only for S3-COMPATIBLE storage; AWS
  // itself is addressed by region alone. What the orchestrator does reject is a
  // malformed one, so that is what's checked, and only once something is typed.
  const endpointTrimmed = endpointUrl.trim();
  const endpointWellFormed = endpointTrimmed === "" || isHttpUrl(endpointTrimmed);
  const showEndpointError = endpointTouched && !endpointWellFormed;
  const showRequiredError = (field: S3RequiredField, valid: boolean) =>
    Boolean(touched[field]) && !valid;
  const lockDaysOk = draftValid(lock);
  const immutability = draftToImmutability(lock);
  // The name is optional here — blank falls back to `add.defaultName` — so an
  // empty field is not an error. Everything else is checked as typed, never on
  // a trimmed copy: the API refuses a name with surrounding whitespace, so
  // trimming it here would create a repository under a name the operator never
  // entered. See src/lib/resource-name.ts.
  const nameProblem = name === "" ? null : resourceNameProblem(name);
  const nameErrorKey = resourceNameErrorKey(nameProblem);
  const nameValid = nameProblem === null;
  // Mirrors the orchestrator's own S3 validation (_validate_s3_configuration):
  // bucket and region are demanded outright, the access key and secret must
  // arrive as a pair, and the endpoint is optional but must parse as an http(s)
  // URL. Enforcing it here is what keeps the dialog from firing a create the
  // appliance is certain to refuse with a 422. Buckets are elastic so capacity
  // isn't asked for; local capacity is read from the filesystem after creation.
  const formValid = isS3
    ? bucketValid && regionValid && accessKeyValid && secretKeyValid && endpointWellFormed && lockDaysOk
    : shareDraftProblem(shareDraft) === null;
  const canSubmit = formValid && nameValid && !submitting;
  // The pre-create test goes through the same server-side validation, so it
  // needs the same fields before it can say anything useful.
  const canTest = bucketValid && regionValid && endpointWellFormed && lockDaysOk && !testing;

  function reset() {
    setName("");
    setType("object-lock-s3");
    setPath("");
    setShareDraft(EMPTY_SHARE_DRAFT);
    setSubmitting(false);
    setBucket("");
    setPrefix("");
    setRegion("");
    setEndpointUrl("");
    setAccessKey("");
    setSecretKey("");
    setVerifyTls(true);
    setLock({ enabled: false, mode: DEFAULT_LOCK_MODE, days: CREATE_LOCK_DAYS });
    setTesting(false);
    setTestResult(null);
    setCreateError(null);
    setTouched({});
    setEndpointTouched(false);
  }

  // Any change to the S3 settings invalidates a prior test result — it spoke
  // to the settings as they were then, not as they are now.
  function withResultCleared<A extends unknown[]>(setter: (...args: A) => void) {
    return (...args: A) => {
      setTestResult(null);
      setCreateError(null);
      setter(...args);
    };
  }

  async function handleTestConnection() {
    if (!canTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testS3Connection({
        bucket: bucket.trim(),
        prefix: prefix.trim(),
        region: region.trim(),
        endpointUrl: endpointUrl.trim(),
        accessKey: accessKey.trim(),
        secretKey,
        verifyTls,
        immutability,
      });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const label = name || t("add.defaultName");
    setSubmitting(true);
    setCreateError(null);
    const result = await createRepository({
      name: label,
      type,
      path: isS3 ? `s3://${bucket.trim()}` : path.trim() || PATH_PLACEHOLDER[type],
      capacityGB: isS3 ? 0 : LOCAL_DEFAULT_CAPACITY_GB,
      s3: isS3
        ? {
            bucket: bucket.trim(),
            prefix: prefix.trim(),
            region: region.trim(),
            endpointUrl: endpointUrl.trim(),
            accessKey: accessKey.trim(),
            secretKey,
            verifyTls,
            immutability,
          }
        : undefined,
      share: isS3 ? undefined : (draftToShare(shareDraft) ?? undefined),
    });
    setSubmitting(false);
    if (!result.ok) {
      // Kept in the dialog rather than fired off as a toast: the operator has
      // to change a field in front of them to fix this, and a refusal that
      // names a failing probe deserves more than four seconds on screen.
      setCreateError({ message: result.message, checks: result.checks });
      toast.error(t("add.toast.failed.title"), { description: result.message });
      return;
    }
    const repo = result.repository;
    toast.success(t("add.toast.added.title"), {
      // Object storage reports no capacity, so quoting one read "0 MB ready to
      // receive backups" on every S3 repository — the same zero the job pages
      // used to print. There is no ceiling to name here, so don't name one.
      description:
        repo.capacityGB > 0
          ? t("add.toast.added.ready", { name: repo.name, size: formatStorage(repo.capacityGB, 0) })
          : t("add.toast.added.readyElastic", { name: repo.name }),
    });
    // A repository created WITH Object Lock on, into a bucket that may already
    // hold backups, has some data locked and some not. The appliance says which
    // in its effect report, and that is worth more than a toast — carry it into
    // a second toast rather than dropping it on the floor.
    reportImmutabilityEffect(result.immutabilityEffect, repo.name);
    setOpen(false);
    reset();
  }

  /** Surfaces the limitations half of the appliance's effect report after a
   *  successful create — the dialog is closing, so anything that still needs
   *  saying has to travel with the toast. */
  function reportImmutabilityEffect(effect: ImmutabilityEffect | null, repoName: string) {
    if (!effect || effect.existingRestorePoints === 0) return;
    toast.warning(t("immutability.toast.existingNotCovered.title", { name: repoName }), {
      description: t("immutability.toast.existingNotCovered.description", {
        count: effect.existingRestorePoints,
      }),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset on open as well as close: the close-time reset seeds from the
        // settings as they were THEN — re-seeding on open picks up any Storage
        // defaults changed in Settings since.
        reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          {t("add.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("add.title")}</DialogTitle>
          <DialogDescription>{t("add.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="repo-name">{t("add.nameLabel")}</Label>
            <Input
              id="repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("add.namePlaceholder")}
              maxLength={RESOURCE_NAME_MAX_LENGTH}
              aria-invalid={!nameValid}
              className={cn(!nameValid && "border-danger")}
              autoFocus
            />
            {nameErrorKey && <p className="text-xs text-danger">{tCommon(nameErrorKey)}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="repo-type">{t("add.typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as OfferedRepositoryType)}>
              <SelectTrigger id="repo-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {REPO_TYPE_META[t].short}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isS3 ? (
            <div className="space-y-3 border border-border bg-muted/30 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="repo-bucket">{t("add.s3.bucketLabel")}</Label>
                  <Input
                    id="repo-bucket"
                    value={bucket}
                    onChange={(e) => withResultCleared(setBucket)(e.target.value)}
                    onBlur={touch("bucket")}
                    placeholder="my-backup-bucket"
                    aria-invalid={showRequiredError("bucket", bucketValid)}
                    className={cn("nums", showRequiredError("bucket", bucketValid) && "border-danger")}
                  />
                  {showRequiredError("bucket", bucketValid) && (
                    <p className="text-xs text-danger">{t("add.s3.bucketRequired")}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="repo-region">{t("add.s3.regionLabel")}</Label>
                  <Input
                    id="repo-region"
                    value={region}
                    onChange={(e) => withResultCleared(setRegion)(e.target.value)}
                    onBlur={touch("region")}
                    placeholder="us-east-1"
                    aria-invalid={showRequiredError("region", regionValid)}
                    className={cn("nums", showRequiredError("region", regionValid) && "border-danger")}
                  />
                  {showRequiredError("region", regionValid) && (
                    <p className="text-xs text-danger">{t("add.s3.regionRequired")}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="repo-endpoint">
                  {t("add.s3.endpointLabel")}{" "}
                  <span className="text-muted-foreground">{t("add.s3.optional")}</span>
                </Label>
                <Input
                  id="repo-endpoint"
                  value={endpointUrl}
                  onChange={(e) => withResultCleared(setEndpointUrl)(e.target.value)}
                  onBlur={() => setEndpointTouched(true)}
                  placeholder="https://s3.example.com"
                  aria-invalid={showEndpointError}
                  className={cn("nums", showEndpointError && "border-danger")}
                />
                {showEndpointError ? (
                  <p className="text-xs text-danger">{t("add.s3.endpointInvalid")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("add.s3.endpointHint")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="repo-prefix">
                  {t("add.s3.prefixLabel")}{" "}
                  <span className="text-muted-foreground">{t("add.s3.optional")}</span>
                </Label>
                <Input
                  id="repo-prefix"
                  value={prefix}
                  onChange={(e) => withResultCleared(setPrefix)(e.target.value)}
                  placeholder="altastor/backups"
                  className="nums"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="repo-access-key">{t("add.s3.accessKeyLabel")}</Label>
                  <Input
                    id="repo-access-key"
                    value={accessKey}
                    onChange={(e) => withResultCleared(setAccessKey)(e.target.value)}
                    onBlur={touch("accessKey")}
                    placeholder="AKIA…"
                    autoComplete="off"
                    aria-invalid={showRequiredError("accessKey", accessKeyValid)}
                    className={cn("nums", showRequiredError("accessKey", accessKeyValid) && "border-danger")}
                  />
                  {showRequiredError("accessKey", accessKeyValid) && (
                    <p className="text-xs text-danger">{t("add.s3.accessKeyRequired")}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="repo-secret-key">{t("add.s3.secretKeyLabel")}</Label>
                  <PasswordInput
                    id="repo-secret-key"
                    value={secretKey}
                    onChange={(e) => withResultCleared(setSecretKey)(e.target.value)}
                    onBlur={touch("secretKey")}
                    placeholder="••••••••"
                    autoComplete="off"
                    showLabel={t("add.s3.secretKeyShow")}
                    hideLabel={t("add.s3.secretKeyHide")}
                    aria-invalid={showRequiredError("secretKey", secretKeyValid)}
                    className={cn("nums", showRequiredError("secretKey", secretKeyValid) && "border-danger")}
                  />
                  {showRequiredError("secretKey", secretKeyValid) && (
                    <p className="text-xs text-danger">{t("add.s3.secretKeyRequired")}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="repo-verify-tls" className="text-xs text-muted-foreground">
                  {t("add.s3.verifyTlsLabel")}
                </Label>
                <Switch
                  id="repo-verify-tls"
                  checked={verifyTls}
                  onCheckedChange={(checked) => withResultCleared(setVerifyTls)(checked)}
                  aria-label={t("add.s3.verifyTlsAria")}
                />
              </div>

              {/* Object Lock. Its own bordered block, not another line in the
                  credential list: it is the one setting here that changes what
                  happens to data after it is written, and it cannot be undone
                  for backups already stored under it. */}
              <div className="border-t border-border pt-3">
                <ImmutabilityFields
                  idPrefix="repo"
                  draft={lock}
                  onChange={(next) => withResultCleared(setLock)(next)}
                >
                  {lock.enabled && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("add.s3.immutability.existingNote")}
                    </p>
                  )}
                </ImmutabilityFields>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleTestConnection}
                  disabled={!canTest}
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  {testing ? t("add.s3.testing") : t("add.s3.test")}
                </Button>
                {testResult && (
                  <ValidationResultPanel
                    ok={testResult.ok}
                    message={testResult.message}
                    checks={testResult.checks}
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="repo-path">{t("add.pathLabel")}</Label>
                <Input
                  id="repo-path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={PATH_PLACEHOLDER[type]}
                  className="nums"
                  spellCheck={false}
                />
              </div>
              <ShareFields idPrefix="repo" draft={shareDraft} onChange={setShareDraft} />
            </>
          )}

          {createError && (
            <ValidationResultPanel ok={false} message={createError.message} checks={createError.checks} />
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("common:actions.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? t("add.adding") : t("add.title")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
