# AltaStor Web Console

The web UI for **AltaStor** — free, open-source VMware backup & replication.
Sealed in stone: immutable, recoverable, and run on your own servers.

This is a React + TypeScript single-page app that acts as a pure client of
the Python FastAPI orchestrator (`python/srv`) shipped alongside it in the
main AltaStor repository. It talks to the orchestrator's `/api/v1/*` REST
API and renders no data of its own.

## Features

- **Dashboard** — appliance health and backup posture at a glance
- **Backups** (`/jobs`) — backup schedules and the restore points they produce,
  and backup copy jobs that copy them into another repository
- **Activity** — running and historical job activity
- **Restore** — restoring VMs from repository restore points
- **Inventory** — vCenter/ESXi topology and protected VM inventory
- **Repositories** — backup repository management
- **Logs** — the appliance's system log and audit log
- **Settings**, **Auth**, **Setup** — appliance configuration, users and roles, authentication, and first-run setup

What each user sees and can do follows their role on the appliance (see
`doc/RBAC.md` in `abr-core`); the appliance enforces it either way.

## Times and time zones

Every time the console prints is in your time zone and says so
("23/10/2026 01:00 GMT+3"); hover it to see the same moment in UTC. Settings →
Appearance sets the time zone ("Auto", the default, follows the browser), the
date format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) and the time format (24-hour
or 12-hour), for this browser. A job's schedule is shown in the job's own time
zone, with your time beside it when the two differ
("Daily · 22:00 UTC (01:00 GMT+3, next day)"). The job form shows the job's
time zone, lets you choose it (a new job starts on yours), and says what the
time you enter means on your clock. Settings → About shows the appliance's
zone. Design and rules: [`doc/TimeZones.md`](doc/TimeZones.md).

## Signing out

The console signs you out after the inactivity time set in Settings →
Security (a click, key press, scroll or page change counts as activity; the
console's own background refreshes don't), warns a minute before, and says on
the sign-in page why the session ended. A session also ends a fixed time after
sign-in, whatever the activity (the appliance's `ABR_WEB_SESSION_LIFETIME_SECONDS`),
with a warning five minutes before.

## Tech stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) for dev server and bundling
- [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) primitives
- [TanStack Query](https://tanstack.com/query) and [TanStack Table](https://tanstack.com/table)
- [Zustand](https://github.com/pmndrs/zustand) for local state
- [react-router-dom](https://reactrouter.com/) for routing
- [react-i18next](https://react.i18next.com/) for i18n (English, German, Spanish, French)
- [Recharts](https://recharts.org/) for charts, [Framer Motion](https://www.framer.com/motion/) for animation

## Prerequisites

- **Node.js** v18.x or higher
- **npm** (or `yarn`/`pnpm`)
- A running AltaStor orchestrator (`python/srv`) to talk to — see the main
  repository for backend setup
- For HTTPS in dev: a checkout of the `abr-core` backend repository next to
  this one (`../abr-core`, or anywhere you point `ABR_CORE_ROOT` at), plus a
  `python3` on `PATH` with `cryptography` installed, so the dev server can
  reuse the backend's self-signed TLS certificate via
  `python -m python.srv.core.tls_bootstrap`. If the checkout can't be found or
  the command can't be run, the dev server falls back to plain HTTP and logs a
  warning saying which of the two it was, instead of failing (override the
  interpreter with `PYTHON_BIN`).

## Getting started

```bash
npm install
npm run dev
```

The app is served at `https://localhost:3000` (or plain HTTP if the TLS
bootstrap step above isn't available). Since the certificate is self-signed,
the browser will show an untrusted-certificate warning the first time —
accept it, the same as for the API on port 443.

In dev, API requests to `/api/*` are proxied same-origin to the orchestrator
at `https://127.0.0.1` (override with the `VITE_API_PROXY` env var), so
the app never has to deal with CORS. The dev/preview port defaults to 3000
and can be overridden with `PORT`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HTTPS + API proxying |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Serve the production build locally, same HTTPS/proxy setup as dev |
| `npm run typecheck` | Type-check only, no emit |
| `npm run lint` | Alias for `typecheck` |

## Project structure

```
src/
  app/         App shell, routing, providers, navigation
  features/    One directory per feature area (dashboard, jobs, activity,
               restore, inventory, repositories, settings, auth, setup, logs,
               replication)
  components/  Shared UI (brand, layout, calendar, shadcn/ui-style primitives)
  services/    API client and data-fetching hooks
  store/       Zustand stores
  i18n/        react-i18next setup and locale files
  lib/         Shared utilities
  mock/        Mock data for local/offline development
  types/       Shared TypeScript types
```

The `APIVER` file at the repo root pins the orchestrator API version
(`ABR_API_MAJOR`/`ABR_API_MINOR`) this console is built against; it's
injected at build time via Vite `define`.

See [doc/WebuiSetup.md](doc/WebuiSetup.md) for more on local setup.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

Copyright © 2026 Norvitex OÜ
