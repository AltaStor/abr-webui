// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { SessionDiskAccess } from "@/types";

/** The last part of a path: what a library path names before its links. */
const fileOf = (path: string) => path.split("/").pop() ?? path;

/**
 * How a vSphere session reaches its disks, as it recorded them when it was
 * created (ABR-497): the API, and over the VDDK the library, the file that
 * library resolved to (libvixDiskLib.so → libvixDiskLib.so.9.1.0.0, which is
 * what support asks for) and where each came from. Later changes to the
 * settings never touch it, so this is what the run really used.
 */
export function DiskAccessFacts({ access, className }: { access: SessionDiskAccess; className?: string }) {
  const { t } = useTranslation("domain");
  const showFile = access.libraryFile && access.library && access.libraryFile !== fileOf(access.library);
  return (
    <section className={className}>
      <h4 className="label-overline mb-2">{t("vsphere.diskAccess")}</h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t("vsphere.apiLabel")}</dt>
        <dd className="min-w-0">
          <span className="font-medium text-foreground">{t(`vsphere.api.${access.api}`)}</span>
          {access.apiSource && <Source>{t(`vsphere.source.${access.apiSource}`)}</Source>}
        </dd>
        {access.api === "vddk" && access.library && (
          <>
            <dt className="text-muted-foreground">{t("vsphere.libraryLabel")}</dt>
            <dd className="min-w-0">
              <code className="nums break-all">{access.library}</code>
              {showFile && (
                <span className="text-muted-foreground">
                  {" → "}
                  <code className="nums break-all text-foreground">{access.libraryFile}</code>
                </span>
              )}
              {access.librarySource && <Source>{t(`vsphere.source.${access.librarySource}`)}</Source>}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

function Source({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-muted-foreground", className)}>
      <span className="text-muted-foreground/40"> · </span>
      {children}
    </span>
  );
}
