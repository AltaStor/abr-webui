// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { RepositoryShare, RepositoryShareInput } from "@/types";

/** An SMB repository's share as the form holds it: one UNC path rather
 *  than the appliance's server and share fields, because that is how the
 *  path is written everywhere else on Windows. */
export interface ShareDraft {
  unc: string;
  username: string;
  password: string;
}

export const EMPTY_SHARE_DRAFT: ShareDraft = { unc: "", username: "", password: "" };

/** \\server\share[\folder] (or with forward slashes) as its server and the
 *  rest; null when it is not a UNC path with at least a share in it. */
export function parseUnc(unc: string): { server: string; share: string } | null {
  const parts = unc.trim().replace(/\//g, "\\").split("\\").filter(Boolean);
  if (!/^\s*(\\\\|\/\/)/.test(unc) || parts.length < 2) return null;
  return { server: parts[0], share: parts.slice(1).join("\\") };
}

export function formatUnc(share: RepositoryShare): string {
  return `\\\\${share.server}\\${share.share}`;
}

export function shareToDraft(share: RepositoryShare | null | undefined): ShareDraft {
  return share ? { unc: formatUnc(share), username: share.username ?? "", password: "" } : EMPTY_SHARE_DRAFT;
}

/** What the draft would save; null while it names no share. */
export function draftToShare(draft: ShareDraft): RepositoryShareInput | null {
  const parsed = parseUnc(draft.unc);
  if (!parsed) return null;
  return {
    ...parsed,
    username: draft.username.trim() || null,
    ...(draft.password && { password: draft.password }),
  };
}

/**
 * Why the draft cannot be saved, or null. An SMB repository needs its share,
 * so an empty path is refused as well as one that is not a UNC path, and so
 * is an account without its password — unless it is the account already
 * saved, whose stored password an empty field keeps.
 */
export function shareDraftProblem(
  draft: ShareDraft,
  saved?: RepositoryShare | null,
): "uncRequired" | "unc" | "password" | null {
  if (!draft.unc.trim()) return "uncRequired";
  if (!parseUnc(draft.unc)) return "unc";
  const username = draft.username.trim();
  const keepsSavedPassword = Boolean(saved?.username) && saved?.username === username;
  if (username && !draft.password && !keepsSavedPassword) return "password";
  return null;
}

/** Whether saving the draft would change the share. */
export function shareDraftChanged(draft: ShareDraft, saved: RepositoryShare | null | undefined): boolean {
  const next = draftToShare(draft);
  if (!next || !saved) return Boolean(next) !== Boolean(saved);
  return (
    next.server !== saved.server ||
    next.share !== saved.share ||
    next.username !== saved.username ||
    Boolean(next.password)
  );
}
