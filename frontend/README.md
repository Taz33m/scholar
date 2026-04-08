## Development

Run the app on `http://localhost:3000`:

```bash
npm run dev
```

The smoke commands do not start the app for you. Keep the dev server running in a separate terminal before invoking them.

## Smoke Harness

There are now two smoke layers:

- `npm run smoke:voice`
  Runs the low-level Gemini Live ping smoke directly from Node. This validates token fetch, Live connect, tool declaration visibility, tool response round-trip, turn completion, and clean close.
- `npm run smoke:wheel`
  Runs one deterministic non-voice app flow per invocation using a browser-driven text-mode Live session. It uses the real client tool handlers, the real workspace, and the same Live session config as the app.

The wheel is round-robin by default. It persists a cursor in the temp directory, advances only after success, and repeats a failed case on the next run.

### Available wheel cases

- `live_ping`
- `flashcards`
- `quiz`
- `worksheet`
- `visualization`
- `canvas_edit`
- `canvas_inspect`

### Commands

Run the next case in the wheel:

```bash
npm run smoke:wheel
```

Run a fixed full sweep:

```bash
npm run smoke:wheel:all
```

Run multiple consecutive wheel cases:

```bash
GEMINILEARN_SMOKE_ITERATIONS=3 npm run smoke:wheel
```

Force one specific case:

```bash
GEMINILEARN_SMOKE_CASE=quiz npm run smoke:wheel
GEMINILEARN_SMOKE_CASE=worksheet npm run smoke:wheel
GEMINILEARN_SMOKE_CASE=canvas_edit npm run smoke:wheel
```

Point the smoke harness at a different app URL if needed:

```bash
GEMINILEARN_SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:wheel
```

### What the browser smoke validates

- `flashcards`
  Forces `generate_flashcards`, expects `3-8` cards, and verifies the flashcards tab becomes active.
- `quiz`
  Forces `generate_quiz`, expects `3-8` questions, and verifies the quiz tab becomes active.
- `worksheet`
  Forces `generate_worksheet`, expects a worksheet artifact with at least `3` questions, and verifies the worksheet tab becomes active.
- `visualization`
  Forces `generate_diagram` or `generate_visualization`, expects image data, and verifies the visualization tab becomes active.
- `canvas_edit`
  Seeds a canvas fixture, forces `edit_canvas`, and verifies visible scene mutation.
- `canvas_inspect`
  Seeds a canvas fixture, asks for explanation only, and verifies the executed tool is `get_canvas_snapshot` with no canvas mutation.

### Failure artifacts

On browser smoke failure, the harness writes diagnostics to:

```text
/tmp/geminilearn-smoke/<timestamp>/<case-id>/
```

Artifacts include a screenshot and a compact workspace snapshot with:

- active tab
- voice status
- latest tool event
- flashcard summary
- quiz summary
- visualization readiness
- canvas scene summary
- recent session events

## Tool/Event Tests

Run the focused regression suite:

```bash
npm run test:tool-events
```

## Waitlist Storage

The waitlist route supports two storage modes:

- Supabase, when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- local JSON fallback, when Supabase is not configured

For Supabase, create the table with:

- [`/Users/tazeemmahashin/Downloads/geminilearn/docs/supabase-waitlist.sql`](/Users/tazeemmahashin/Downloads/geminilearn/docs/supabase-waitlist.sql)

The route is:

- [`/Users/tazeemmahashin/Downloads/geminilearn/frontend/app/api/waitlist/route.ts`](/Users/tazeemmahashin/Downloads/geminilearn/frontend/app/api/waitlist/route.ts)

## Student Access Backend

This repo now includes the first backend slice for student access:

- public auth entry at `/login`
- public auth routes at `/auth/request-link` and `/auth/callback`
- future student APIs under `/api/student/*`

The student APIs are intentionally still blocked in production by [`/Users/tazeemmahashin/Downloads/scholar-main/frontend/proxy.ts`](/Users/tazeemmahashin/Downloads/scholar-main/frontend/proxy.ts). Only the minimal login flow is meant to ship in this phase.

### Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`

`SUPABASE_URL` remains supported as a server-side fallback for the existing waitlist/admin helpers, but the auth flow expects the public `NEXT_PUBLIC_*` values to be present.

### Database setup

Apply the student access schema in Supabase SQL Editor:

- [`/Users/tazeemmahashin/Downloads/scholar-main/docs/supabase-student-access.sql`](/Users/tazeemmahashin/Downloads/scholar-main/docs/supabase-student-access.sql)

This schema creates:

- `app_users`
- `courses`
- `course_enrollments`
- `student_session_summaries`
- `can_request_student_access(citext)`

The callback route provisions `app_users`, binds matching enrollments by email, and activates `invited` rows after Supabase Auth verifies the magic link.
