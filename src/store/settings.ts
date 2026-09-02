// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Appliance settings store — the editable configuration surface behind the
 * Settings page. This is a front-end prototype: there is no settings API on the
 * appliance yet (config is applied once via the day-0 provisioning manifest), so
 * changes here persist to localStorage and feel real across reloads. Saving
 * shows a confirmation toast at the call site.
 *
 * Appearance `theme` deliberately lives in the UI store (@/store/ui) so the
 * top-bar toggle and this page stay in sync; the Settings page reads/writes it
 * there. Everything else lives here.
 */
import { create } from "zustand";
import type {
  AppSettings,
  AppearanceSettings,
  ApiToken,
  ApplianceSettings,
  EmailSettings,
  GeneralSettings,
  NetworkSettings,
  NotificationEvents,
  NotificationSettings,
  SecuritySettings,
  StorageDefaults,
  UpdateSettings,
  UserAccount,
  Webhook,
} from "@/types";
import { getSettings as getSettingsHttp, putSettings as putSettingsHttp } from "@/services/api.http";
import { useWorldStore } from "@/store/world";

/* Types now live in @/types (shared with the appliance). Re-export the ones
 * existing call sites import from here so nothing had to change. */
export type {
  AppSettings,
  AppearanceSettings,
  ApiToken,
  ApplianceSettings,
  Compression,
  Density,
  EmailSettings,
  GeneralSettings,
  MailEncryption,
  NetworkSettings,
  NotificationEvents,
  NotificationSettings,
  SecuritySettings,
  StorageDefaults,
  UpdateChannel,
  UpdateSettings,
  UserAccount,
  UserRole,
  UserStatus,
  Webhook,
  WebhookKind,
} from "@/types";

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

/**
 * Shipped defaults. Identity, notification transports and network carry NO
 * invented values: this object is what an operator sees before (or instead of)
 * a successful settings fetch, and a plausible-looking organization, SMTP
 * relay, enabled webhook or static address would read as *their* appliance's
 * configuration. Empty is the only honest stand-in for "not configured yet",
 * and it is also what `resetAll()` must be safe to write back.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    applianceName: "AltaStor Appliance",
    hostname: "",
    organization: "",
    contactEmail: "",
    timezone: "Europe/Kyiv",
    timeFormat: "24h",
    dateFormat: "iso",
  },
  appearance: {
    density: "comfortable",
    reduceMotion: false,
    accent: "cyan",
    sidebarAutoCollapse: false,
    language: "en",
  },
  notifications: {
    email: {
      // Off, and empty: an alerting transport shown as configured is a promise
      // nothing on the appliance is keeping.
      enabled: false,
      smtpHost: "",
      smtpPort: 587,
      encryption: "starttls",
      username: "",
      fromAddress: "",
      recipients: [],
    },
    webhooks: [],
    events: {
      jobFailure: true,
      jobSuccess: false,
      capacityWarning: true,
      restoreCompleted: true,
    },
  },
  security: {
    mfaRequired: true,
    sessionDurationSec: 3600,
    passwordMinLength: 12,
    auditRetentionDays: 365,
    autoLockThreatResponse: true,
  },
  storageDefaults: {
    compression: "optimal",
    dedup: true,
    gcSchedule: "daily",
    capacityWarnPct: 80,
    capacityCriticalPct: 90,
    archiveTierEnabled: true,
    archiveAfterDays: 30,
    globalThrottleMBps: 0,
  },
  network: {
    // DHCP with no addresses: a hardcoded static lease pushed to a real
    // appliance can take it off the network. NTP is a genuine shipped default.
    ipMode: "dhcp",
    address: "",
    gateway: "",
    dns: [],
    ntpServers: ["time.cloudflare.com", "pool.ntp.org"],
    proxyUrl: "",
    managementPort: 4980,
  },
  updates: {
    channel: "stable",
    autoCheck: true,
    autoInstall: false,
    maintenanceWindow: "02:00-04:00",
  },
  users: [
    {
      id: "u-1",
      name: "Alex Rivera",
      email: "admin@corp.local",
      role: "admin",
      status: "active",
      mfaEnabled: true,
      lastActiveAt: iso(0),
    },
    {
      id: "u-2",
      name: "Priya Menon",
      email: "priya@corp.local",
      role: "operator",
      status: "active",
      mfaEnabled: true,
      lastActiveAt: iso(1),
    },
    {
      id: "u-3",
      name: "Sam Okafor",
      email: "sam@corp.local",
      role: "operator",
      status: "active",
      mfaEnabled: false,
      lastActiveAt: iso(4),
    },
    {
      id: "u-4",
      name: "Auditor (read-only)",
      email: "audit@corp.local",
      role: "viewer",
      status: "active",
      mfaEnabled: true,
      lastActiveAt: iso(12),
    },
    {
      id: "u-5",
      name: "Jordan Lee",
      email: "jordan@corp.local",
      role: "operator",
      status: "invited",
      mfaEnabled: false,
      lastActiveAt: null,
    },
  ],
  /* Always empty by default. Nothing in the control plane issues or verifies a
   * bearer token, so a pre-seeded entry would be a credential that was never
   * granted — indistinguishable, to an admin auditing their own box, from a
   * compromise. Tokens created locally via the Settings UI still populate this
   * list; only the shipped default is empty. */
  apiTokens: [],
};

const STORAGE_KEY = "basalt.settings";

/** Bump when a release must invalidate stale browser-local settings — e.g. the
 * AltaStor rebrand, which changed default names/emails and the brand accent.
 * Anything older (including the pre-v2 bare-AppSettings blob with no envelope)
 * is dropped so the new defaults actually reach existing browsers instead of
 * being permanently shadowed by a saved copy of the old defaults.
 *
 * v3: the demo identity/SMTP/webhook/static-address block left the defaults. A
 * browser that cached it would otherwise keep presenting `corp.local` and a
 * fixed static address as this appliance's configuration. */
const SETTINGS_VERSION = 3;

/** Deep-ish merge that keeps saved values but backfills any newly-added keys
 * from defaults (so a same-version schema change never leaves a section
 * half-populated). Older-versioned or malformed data falls back to defaults. */
function hydrate(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as { v?: number; settings?: Partial<AppSettings> };
    if (parsed?.v !== SETTINGS_VERSION || !parsed.settings) return DEFAULT_SETTINGS;
    const saved = parsed.settings;
    return {
      general: { ...DEFAULT_SETTINGS.general, ...saved.general },
      appearance: { ...DEFAULT_SETTINGS.appearance, ...saved.appearance },
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...saved.notifications,
        email: { ...DEFAULT_SETTINGS.notifications.email, ...saved.notifications?.email },
        events: { ...DEFAULT_SETTINGS.notifications.events, ...saved.notifications?.events },
        webhooks: saved.notifications?.webhooks ?? DEFAULT_SETTINGS.notifications.webhooks,
      },
      security: { ...DEFAULT_SETTINGS.security, ...saved.security },
      storageDefaults: { ...DEFAULT_SETTINGS.storageDefaults, ...saved.storageDefaults },
      network: { ...DEFAULT_SETTINGS.network, ...saved.network },
      updates: { ...DEFAULT_SETTINGS.updates, ...saved.updates },
      users: saved.users ?? DEFAULT_SETTINGS.users,
      apiTokens: saved.apiTokens ?? DEFAULT_SETTINGS.apiTokens,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Whether what the store holds is the appliance's own configuration.
 *
 * - `local`   — nothing to sync with: the demo world, or live before the first
 *               settings fetch has answered.
 * - `synced`  — a real fetch landed; the values below are the appliance's.
 * - `unreachable` — the fetch failed. The values below are shipped defaults or
 *               a browser cache, NOT this appliance's configuration, and must
 *               never be written back over whatever the appliance really holds.
 */
export type SettingsSyncStatus = "local" | "synced" | "unreachable";

interface SettingsStore extends AppSettings {
  /** See `SettingsSyncStatus`. Read by the Save bars and the Settings page. */
  syncStatus: SettingsSyncStatus;
  updateGeneral(patch: Partial<GeneralSettings>): void;
  updateAppearance(patch: Partial<AppearanceSettings>): void;
  updateNotifications(patch: Partial<NotificationSettings>): void;
  updateEmail(patch: Partial<EmailSettings>): void;
  updateEvents(patch: Partial<NotificationEvents>): void;
  addWebhook(w: Omit<Webhook, "id">): void;
  updateWebhook(id: string, patch: Partial<Webhook>): void;
  removeWebhook(id: string): void;
  updateSecurity(patch: Partial<SecuritySettings>): void;
  updateStorageDefaults(patch: Partial<StorageDefaults>): void;
  updateNetwork(patch: Partial<NetworkSettings>): void;
  updateUpdates(patch: Partial<UpdateSettings>): void;
  addUser(u: Omit<UserAccount, "id">): void;
  updateUser(id: string, patch: Partial<UserAccount>): void;
  removeUser(id: string): void;
  addToken(t: Omit<ApiToken, "id">): void;
  revokeToken(id: string): void;
  resetAll(): void;
  /** Apply the appliance-owned subset from the server without echoing it back. */
  applyRemote(appliance: ApplianceSettings): void;
}

let _seq = 0;
const genId = (p: string) => `${p}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;

/** The appliance-persisted subset — everything except browser-local appearance. */
function applianceSubset(s: AppSettings): ApplianceSettings {
  return {
    general: s.general,
    notifications: s.notifications,
    security: s.security,
    storageDefaults: s.storageDefaults,
    network: s.network,
    updates: s.updates,
    users: s.users,
    apiTokens: s.apiTokens,
  };
}

function isLive(): boolean {
  try {
    return useWorldStore.getState().mode === "live";
  } catch {
    return false;
  }
}

/** Debounced PUT of the appliance subset to the control plane (live mode only). */
let putTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleServerPut(get: () => SettingsStore): void {
  if (putTimer !== null) clearTimeout(putTimer);
  putTimer = setTimeout(() => {
    putTimer = null;
    // Re-checked when the timer fires, not just when it was scheduled: the
    // world can switch, or a hydrate can fail, inside the debounce window.
    if (!isLive() || get().syncStatus !== "synced") return;
    void putSettingsHttp(applianceSubset(get())).catch(() => {
      /* offline / appliance down — localStorage still holds the change */
    });
  }, 400);
}

function writeLocalCache(s: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SETTINGS_VERSION, settings: s }));
  } catch {
    /* storage full / disabled — settings simply won't persist this session */
  }
}

/** Persist after a local change: always cache locally; in live mode also PUT —
 * but ONLY once a hydrate has actually succeeded.
 *
 * The gate is `=== "synced"`, deliberately not `!== "unreachable"`. `syncStatus`
 * starts at `"local"`, so the looser test also passes in the window between
 * entering live mode and the first settings fetch returning — and what the
 * store holds there is the shipped stand-in, not the appliance's configuration.
 * An edit in that window would blank the operator's real organization, hostname
 * and network over the wire. Never send config we have not first read. */
function persist(get: () => SettingsStore) {
  writeLocalCache(get());
  if (isLive() && get().syncStatus === "synced") scheduleServerPut(get);
}

/**
 * Pull the appliance-owned settings from the control plane and merge them in,
 * keeping the browser-local `appearance`. Called once the live world is ready.
 *
 * A failure is recorded, not swallowed. What the store holds when the fetch
 * fails is a shipped default or a browser cache — on a first visit, literally
 * `DEFAULT_SETTINGS` — and presenting that as the appliance's configuration is
 * how an operator comes to believe alerting is wired up when nothing is. The
 * `unreachable` status drives the banner on the Settings page and disables the
 * Save bars, so an unrelated edit cannot PUT the stand-in back as truth.
 */
export async function hydrateSettingsFromServer(): Promise<void> {
  try {
    const remote = await getSettingsHttp();
    useSettingsStore.getState().applyRemote(remote);
    useSettingsStore.setState({ syncStatus: "synced" } as Partial<SettingsStore>);
  } catch {
    useSettingsStore.setState({ syncStatus: "unreachable" } as Partial<SettingsStore>);
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const commit = (partial: Partial<AppSettings>) => {
    set(partial as Partial<SettingsStore>);
    persist(get);
  };
  return {
    ...hydrate(),
    // Nothing has been read from an appliance yet. `hydrateSettingsFromServer`
    // moves this to `synced` or `unreachable`; the demo world leaves it here.
    syncStatus: "local",

    updateGeneral: (patch) => commit({ general: { ...get().general, ...patch } }),
    updateAppearance: (patch) => commit({ appearance: { ...get().appearance, ...patch } }),
    updateNotifications: (patch) => commit({ notifications: { ...get().notifications, ...patch } }),
    updateEmail: (patch) =>
      commit({ notifications: { ...get().notifications, email: { ...get().notifications.email, ...patch } } }),
    updateEvents: (patch) =>
      commit({ notifications: { ...get().notifications, events: { ...get().notifications.events, ...patch } } }),
    addWebhook: (w) =>
      commit({
        notifications: {
          ...get().notifications,
          webhooks: [...get().notifications.webhooks, { ...w, id: genId("wh") }],
        },
      }),
    updateWebhook: (id, patch) =>
      commit({
        notifications: {
          ...get().notifications,
          webhooks: get().notifications.webhooks.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        },
      }),
    removeWebhook: (id) =>
      commit({
        notifications: {
          ...get().notifications,
          webhooks: get().notifications.webhooks.filter((w) => w.id !== id),
        },
      }),
    updateSecurity: (patch) => commit({ security: { ...get().security, ...patch } }),
    updateStorageDefaults: (patch) => commit({ storageDefaults: { ...get().storageDefaults, ...patch } }),
    updateNetwork: (patch) => commit({ network: { ...get().network, ...patch } }),
    updateUpdates: (patch) => commit({ updates: { ...get().updates, ...patch } }),
    addUser: (u) => commit({ users: [...get().users, { ...u, id: genId("u") }] }),
    updateUser: (id, patch) => commit({ users: get().users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }),
    removeUser: (id) => commit({ users: get().users.filter((u) => u.id !== id) }),
    addToken: (t) => commit({ apiTokens: [...get().apiTokens, { ...t, id: genId("tok") }] }),
    revokeToken: (id) => commit({ apiTokens: get().apiTokens.filter((t) => t.id !== id) }),
    resetAll: () => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      // `general` and `network` are carried across a reset rather than
      // defaulted: identity and addressing are facts about this box, not
      // preferences with a shipped value. Resetting them would write a blank
      // hostname and a DHCP switch to the control plane — enough to take the
      // appliance off the network from a Settings page click.
      const current = get();
      const next: AppSettings = { ...DEFAULT_SETTINGS, general: current.general, network: current.network };
      set(next as Partial<SettingsStore>);
      // Push to the appliance too — but only from a confirmed-read baseline
      // (see `persist`): before the first hydrate lands, what we hold is the
      // shipped stand-in, not its configuration.
      if (isLive() && current.syncStatus === "synced") {
        void putSettingsHttp(applianceSubset(next)).catch(() => {});
      }
    },
    applyRemote: (appliance) => {
      // Don't let a connect-time hydrate stomp an edit the user just made — if a
      // local PUT is still pending, our value is newer than the server's.
      if (putTimer !== null) return;
      // Replace the appliance-owned sections; keep local appearance untouched.
      set(appliance as Partial<SettingsStore>);
      writeLocalCache(get());
    },
  };
});
