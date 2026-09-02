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

const TYPE_OPTIONS: RepositoryType[] = ["object-lock-s3", "local"];

const PATH_PLACEHOLDER: Record<RepositoryType, string> = {
  "hardened-immutable": "/mnt/vault/hardened",
  "object-lock-s3": "s3://your-bucket-name",
  nfs: "nfs://nas01.local/backups",
  local: "/var/vault/backups",
};

/** Local storage has no way to report real capacity up front — the appliance
 *  reads it from the filesystem once the repository exists — so creation
 *  just seeds a placeholder that gets replaced on the first scan. */
const LOCAL_DEFAULT_CAPACITY_GB = 500;

export function AddRepositoryDialog() {
  const { t } = useTranslation("repositories");
  const createRepository = useWorldStore((s) => s.createRepository);
  const testS3Connection = useWorldStore((s) => s.testS3Connection);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<RepositoryType>("object-lock-s3");
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

  const isS3 = type === "object-lock-s3";
  const bucketValid = bucket.trim().length > 0;
  const endpointValid = endpointUrl.trim().length > 0;
  const nameTrimmed = name.trim();
  const nameValid =
    nameTrimmed === "" ||
    (nameTrimmed.length <= REPOSITORY_NAME_MAX_LENGTH && REPOSITORY_NAME_PATTERN.test(nameTrimmed));
  // S3 buckets are elastic, so capacity isn't required; bucket name and the
  // endpoint they live behind are. Local storage capacity is read from the
  // filesystem once the repository exists, so there is nothing further to
  // require here.
  const formValid = isS3 ? bucketValid && endpointValid : true;
  const canSubmit = formValid && nameValid && !submitting;

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
    if (!bucketValid || !endpointValid || testing) return;
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
          ? "The appliance refused the request — check the bucket, endpoint and credentials, then try again."
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
              className={cn(!nameValid && "border-danger focus-visible:ring-danger/40")}
              autoFocus
            />
            {!nameValid && <p className="text-xs text-danger">{t("add.nameInvalid")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="repo-type">{t("add.typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as RepositoryType)}>
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
            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="repo-bucket">Bucket</Label>
                  <Input
                    id="repo-bucket"
                    value={bucket}
                    onChange={(e) => withResultCleared(setBucket)(e.target.value)}
                    placeholder="my-backup-bucket"
                    className="nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="repo-region">Region</Label>
                  <Input
                    id="repo-region"
                    value={region}
                    onChange={(e) => withResultCleared(setRegion)(e.target.value)}
                    placeholder="us-east-1"
                    className="nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="repo-endpoint">Endpoint URL</Label>
                <Input
                  id="repo-endpoint"
                  value={endpointUrl}
                  onChange={(e) => withResultCleared(setEndpointUrl)(e.target.value)}
                  placeholder="https://s3.example.com"
                  aria-invalid={!endpointValid}
                  className={cn("nums", !endpointValid && "border-danger focus-visible:ring-danger/40")}
                />
                {!endpointValid && <p className="text-xs text-danger">Required — the S3-compatible endpoint to connect to.</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="repo-prefix">
                  Prefix <span className="text-muted-foreground">(optional)</span>
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
                  <Label htmlFor="repo-access-key">Access key</Label>
                  <Input
                    id="repo-access-key"
                    value={accessKey}
                    onChange={(e) => withResultCleared(setAccessKey)(e.target.value)}
                    placeholder="AKIA…"
                    autoComplete="off"
                    className="nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="repo-secret-key">Secret key</Label>
                  <Input
                    id="repo-secret-key"
                    type="password"
                    value={secretKey}
                    onChange={(e) => withResultCleared(setSecretKey)(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                    className="nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="repo-verify-tls" className="text-xs text-muted-foreground">
                  Verify TLS certificate
                </Label>
                <Switch
                  id="repo-verify-tls"
                  checked={verifyTls}
                  onCheckedChange={(checked) => withResultCleared(setVerifyTls)(checked)}
                  aria-label="Verify the endpoint TLS certificate"
                />
              </div>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleTestConnection}
                  disabled={!bucketValid || !endpointValid || testing}
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  {testing ? "Testing connection…" : "Test connection"}
                </Button>
                {testResult && (
                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs",
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
