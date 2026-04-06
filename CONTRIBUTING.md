# Contributing to Mission Control

Mission Control is an internal monitoring dashboard. Keep it lean and operational.

## Local setup

- Use Node.js 20+.
- Install dependencies in the app directory that contains the panel code.
- Start from the repo root only if the workspace scripts require it.
- If you are working on the panel app directly, go to `apps/panel` first.

Example:

```bash
cd apps/panel
npm install
npm run dev
```

## Docker context

- The repo includes infrastructure under `infra/`.
- Treat the panel as a Next.js app that may depend on local host access, log files, and remote shell access.
- If you change runtime paths or log sources, verify the Docker or host setup still has access.
- Do not assume the same environment works on bazza and prod without checking the helper code.

## Branching

- Branch from the current mainline branch.
- Keep changes small.
- One dashboard or API concern per PR.
- Rebase or merge cleanly before review.

## PR expectations

- Explain what telemetry or UI behavior changed.
- Call out any log source changes.
- Include screenshots for dashboard work.
- Mention any host, Docker, or infra changes.
- Keep it practical. This is an internal tool.

## Code standards

- TypeScript and React.
- Follow the existing Next.js app structure.
- Keep log parsing in helpers, not in page components.
- Return safe empty values when a log source is unavailable.
- Prefer defensive code over hard failures.
- Keep UI components direct and readable.

## Testing and verification

- Build and run the app after changes.
- Verify the security routes still return sane data.
- Check both local and remote telemetry paths if your change touches them.
- Confirm the dashboard still renders when a log source is missing.

## Notes

- The product is operational, not cosmetic.
- The main value is in the API routes and log parsing.
- If you change log helpers, update the surrounding docs or comments to match.
