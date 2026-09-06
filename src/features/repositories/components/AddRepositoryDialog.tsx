// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Plus, Wifi, XCircle } from "@/lib/icons";
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
import type { RepositoryType, S3ConnectionTestResult } from "@/types";
import { REPO_TYPE_META, REPOSITORY_NAME_MAX_LENGTH, REPOSITORY_NAME_PATTERN } from "./repoMeta";

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

export function AddRepositoryDialog() {
  const { t } = useTranslation("repositories");
  const createRepository = useWorldStore((s) => s.createRepository);
  const testS3Connection = useWorldStore((s) => s.testS3Connection);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<OfferedRepositoryType>("object-lock-s3");
  const [path, setPath] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // S3 connection settings — only used when type is "object-lock-s3".
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [region, setRegion] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [verifyTls, setVerifyTls] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<S3ConnectionTestResult | null>(null);
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
  const nameTrimmed = name.trim();
  const nameValid =
    nameTrimmed === "" ||
    (nameTrimmed.length <= REPOSITORY_NAME_MAX_LENGTH && REPOSITORY_NAME_PATTERN.test(nameTrimmed));
  // Mirrors the orchestrator's own S3 validation (_validate_s3_configuration):
  // bucket and region are demanded outright, the access key and secret must
  // arrive as a pair, and the endpoint is optional but must parse as an http(s)
  // URL. Enforcing it here is what keeps the dialog from firing a create the
  // appliance is certain to refuse with a 422. Buckets are elastic so capacity
  // isn't asked for; local capacity is read from the filesystem after creation.
  const formValid = isS3
    ? bucketValid && regionValid && accessKeyValid && secretKeyValid && endpointWellFormed
    : true;
  const canSubmit = formValid && nameValid && !submitting;
  // The pre-create test goes through the same server-side validation, so it
  // needs the same fields before it can say anything useful.
  const canTest = bucketValid && regionValid && endpointWellFormed && !testing;

  function reset() {
    setName("");
    setType("object-lock-s3");
    setPath("");
    setSubmitting(false);
    setBucket("");
    setPrefix("");
    setRegion("");
    setEndpointUrl("");
    setAccessKey("");
    setSecretKey("");
    setVerifyTls(true);
    setTesting(false);
    setTestResult(null);
    setTouched({});
    setEndpointTouched(false);
  }

  // Any change to the S3 settings invalidates a prior test result — it spoke
  // to the settings as they were then, not as they are now.
  function withResultCleared<A extends unknown[]>(setter: (...args: A) => void) {
    return (...args: A) => {
      setTestResult(null);
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
      });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const label = name.trim() || t("add.defaultName");
    setSubmitting(true);
    const repo = await createRepository({
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
          }
        : undefined,
    });
    setSubmitting(false);
    if (!repo) {
      toast.error(t("add.toast.failed.title"), {
        description: isS3
          ? t("add.toast.failed.s3Description")
          : t("add.toast.failed.description"),
      });
      return;
    }
    toast.success(t("add.toast.added.title"), {
      description: t("add.toast.added.ready", {
        name: repo.name,
        size: formatStorage(repo.capacityGB, 0),
      }),
    });
    setOpen(false);
    reset();
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
              maxLength={REPOSITORY_NAME_MAX_LENGTH}
              aria-invalid={!nameValid}
              className={cn(!nameValid && "border-danger")}
              autoFocus
            />
            {!nameValid && <p className="text-xs text-danger">{t("add.nameInvalid")}</p>}
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
                  <Input
                    id="repo-secret-key"
                    type="password"
                    value={secretKey}
                    onChange={(e) => withResultCleared(setSecretKey)(e.target.value)}
                    onBlur={touch("secretKey")}
                    placeholder="••••••••"
                    autoComplete="off"
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
                  <div
                    className={cn(
                      "flex items-start gap-2 px-3 py-2.5 text-xs",
                      testResult.ok
                        ? "bg-success-subtle text-success-text"
                        : "bg-danger-subtle text-danger-text",
                    )}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">{testResult.message}</p>
                      {testResult.checks.some((c) => c.status === "failed") && (
                        <ul className="mt-1 space-y-0.5 text-[11px] opacity-90">
                          {testResult.checks
                            .filter((c) => c.status === "failed" && c.message)
                            .map((c) => (
                              <li key={c.name} className="break-words">
                                {c.message}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
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
