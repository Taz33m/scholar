# Production Deploy

## Recommended host

Use Railway for the current launch.

Why:

- The app is a Next.js frontend living in `/frontend`.
- The waitlist currently writes to a local JSON file.
- Railway supports persistent volumes, which lets us keep the current waitlist implementation without moving to a database first.

## Service settings

- Root directory: `/frontend`
- Build command: `npm run build`
- Start command: `npm run start -- --hostname 0.0.0.0 --port $PORT`

## Persistent storage

Create a volume and mount it at:

`/data`

Then set this environment variable on the service:

`WAITLIST_PATH=/data/waitlist.json`

The waitlist route already supports this variable.

## Domain

Two easy options:

1. Buy the domain through Railway and attach it directly.
2. Keep your current registrar and add the Railway DNS records in your DNS provider.

## Current production behavior

This repo is already configured so the public production site is landing-page-only:

- `/sessions/*` redirects to `/`
- `/api/*` is blocked in production except `/api/waitlist`

That means we can ship the marketing site + waitlist without exposing the tutor product itself.

## Notes

- No persistent database is required for the current launch.
- If we later move the waitlist to a hosted database, Vercel becomes a stronger option.
