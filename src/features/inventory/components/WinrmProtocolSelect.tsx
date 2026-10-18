// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WinrmProtocol } from "@/types";

export const WINRM_PORTS: Record<WinrmProtocol, number> = { https: 5986, http: 5985 };
export const DEFAULT_WINRM_PROTOCOL: WinrmProtocol = "https";

/** The port to show after the protocol changes: an empty or standard WinRM
 *  port follows the protocol, a port the operator chose stays. Same rule as
 *  the appliance applies on edit. */
export function portAfterProtocolChange(port: string, protocol: WinrmProtocol): string {
  const current = port.trim();
  const standard = Object.values(WINRM_PORTS).map(String);
  return current === "" || standard.includes(current) ? String(WINRM_PORTS[protocol]) : port;
}

export function WinrmProtocolSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: WinrmProtocol | undefined;
  onChange: (protocol: WinrmProtocol) => void;
}) {
  const { t } = useTranslation("inventory");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("winrm.protocolLabel")}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v as WinrmProtocol)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={t("winrm.notDetected")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="https">HTTPS</SelectItem>
          <SelectItem value="http">HTTP</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function WinrmProtocolNote({ protocol }: { protocol: WinrmProtocol | undefined }) {
  const { t } = useTranslation("inventory");
  if (protocol === "http") {
    return <p className="-mt-2 text-xs text-warning-text">{t("winrm.httpWarning")}</p>;
  }
  if (protocol === undefined) {
    return <p className="-mt-2 text-xs text-muted-foreground">{t("winrm.notDetectedHint")}</p>;
  }
  return <p className="-mt-2 text-xs text-muted-foreground">{t("winrm.httpsHint")}</p>;
}
