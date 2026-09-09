// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { CheckCircle2, MinusCircle, XCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { S3ConnectionCheck } from "@/types";

/**
 * The appliance's verdict on a repository, with the probes behind it.
 *
 * Every repository-validation endpoint answers in the same shape — a status, a
 * summary line, and a list of named checks — so every surface that asks one of
 * them (the create dialog's connection test, the edit dialog's Object Lock
 * validation, the detail dialog's full verify) renders the answer through here.
 *
 * The failed checks are always shown: a summary alone tells an operator that
 * their bucket was refused, and the checks tell them which of Object Lock,
 * versioning, mode, period, write or delete-refusal was the one that said no —
 * which is the difference between a fixable configuration and a dead end.
 * Passing checks are shown too, collapsed behind their own summary, because
 * "what did it actually manage to prove" is the other half of the question.
 */
export function ValidationResultPanel({
  ok,
  message,
  checks,
  className,
}: {
  ok: boolean;
  message: string;
  checks: S3ConnectionCheck[];
  className?: string;
}) {
  const { t } = useTranslation("repositories");
  const failed = checks.filter((c) => c.status === "failed");
  const passed = checks.filter((c) => c.status === "ok");
  const skipped = checks.filter((c) => c.status === "skipped");

  return (
    <div
      className={cn(
        "px-3 py-2.5 text-xs",
        ok ? "bg-success-subtle text-success-text" : "bg-danger-subtle text-danger-text",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <p className="min-w-0 font-medium">{message}</p>
      </div>

      {failed.length > 0 && (
        <ul className="mt-2 space-y-1">
          {failed.map((c) => (
            <CheckLine key={c.name} check={c} />
          ))}
        </ul>
      )}

      {/* Skipped is a real answer, not an absence: "immutability is disabled,
          so nothing was locked" is exactly what an operator needs to read when
          they expected a lock to have been checked. */}
      {skipped.length > 0 && (
        <ul className="mt-2 space-y-1 opacity-90">
          {skipped.map((c) => (
            <CheckLine key={c.name} check={c} />
          ))}
        </ul>
      )}

      {passed.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none opacity-90">
            {t("validation.passedChecks", { count: passed.length })}
          </summary>
          <ul className="mt-1 space-y-1">
            {passed.map((c) => (
              <CheckLine key={c.name} check={c} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CheckLine({ check }: { check: S3ConnectionCheck }) {
  const { t } = useTranslation("repositories");
  const Icon =
    check.status === "ok" ? CheckCircle2 : check.status === "failed" ? XCircle : MinusCircle;
  /* The appliance names its probes in snake_case (`worm_enforcement`); the
   * console gives the ones it knows a human label and falls through to the raw
   * name for any it doesn't, so a check added server-side still renders. */
  const label = t([`validation.check.${check.name}`, "validation.check.unknown"], {
    name: check.name,
  });
  return (
    <li className="flex items-start gap-1.5">
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="min-w-0 break-words">
        <span className="font-medium">{label}</span>
        {check.message ? <span className="opacity-90"> — {check.message}</span> : null}
      </span>
    </li>
  );
}
