# Mission Control

Mission Control is a security monitoring dashboard. It reads host logs and surfaces recent activity, top sources, and suspicious patterns for two environments: `bazza` and `prod`.

## What it is

The current code is a Next.js app focused on security telemetry. The API routes pull from:

- nginx access logs
- kernel logs / firewall blocks
- auth/security log sources handled by shared helpers

The UI code in `apps/panel` is built around incident triage and threat visibility.

## Purpose

This is not a general business app. It is a control panel for answering questions like:

- what is hitting the box right now?
- which IPs are noisy?
- are there firewall blocks?
- what are the latest suspicious requests?

## Tech stack

- Next.js
- React
- TypeScript
- Tailwind-based UI components
- Node.js file/system access for local logs
- Remote shell execution for the `prod` host

## App structure

The visible product lives under `apps/panel`.

The important pieces in this repo are:

- API routes under `src/app/api/security`
- shared security log helpers in `src/app/api/security/_security-logs.ts`
- dashboard components under `src/components`

The API routes currently exposed include:

- `security/nginx-logs`
- `security/ssh-attacks`
- `security/geo`
- `security/alerts`
- `security/auth-log`
- `security/firewall`

## Local setup

### Prereqs

- Node.js 20+
- access to the local log paths used by the API routes
- whatever remote access `runRemote()` expects for the `prod` host

### Install

From the app directory:

```bash
cd apps/panel
npm install
```

### Environment variables

This code does not expose a clean env contract in the files inspected. The runtime depends on whatever `runRemote`, `readFirstExisting`, and related helpers are wired to use.

If you are deploying or running this outside the current host setup, inspect `src/app/api/security/_security-logs.ts` and the deployment scripts before assuming the required variables.

## How to run

Typical Next.js commands:

```bash
npm run dev
npm run build
npm run start
```

Run them from `apps/panel`.

## Deployment

Deploy as a standard Next.js app, but make sure the server has:

- access to local log files
- permission to read journal output
- working remote access for the `prod` telemetry path

If those are missing, the API routes fall back to empty results instead of crashing.

## Notes

- The dashboard logic is operational, not decorative.
- Most of the value is in the API routes and log parsing, not in a large client app.
- The code is defensive: when log reads fail, it returns empty arrays and counts instead of hard failing.