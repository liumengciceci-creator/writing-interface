# ArguWeave research logging

## Start a participant session

Add an anonymous participant id to the study URL:

```text
https://writing-interface.vercel.app/?participant=P01&condition=A
```

`participant` (or `pid`) enables logging. Without it, normal use is not logged.
The browser creates a unique session id, keeps an offline queue, submits events
in batches, and retains a local JSON backup. The top-left `...` menu shows the
active participant and provides **Finish study and export log**.

## What is recorded

- module additions, deletions, moves, text edits, type changes, and floating bounds;
- selections, undo/redo, paragraph completion, and Word export;
- AI generation inputs, outputs, first-text latency, duration, failure/cancel state;
- instruction-based revisions and length adjustments;
- review scope, overall evaluation, each relationship result, suggestions opened,
  accepted, applied, deferred, or failed;
- initial, intermediate, and final document snapshots.

The id is pseudonymous. Do not place a participant's name or email in the URL.

## Local/server-file storage

Without database variables, `server.js` writes NDJSON files to:

```text
./data/research-logs/P01.ndjson
```

Override the directory with:

```text
RESEARCH_LOG_DIR=/persistent/path/research-logs
RESEARCH_EXPORT_TOKEN=replace-with-a-long-random-secret
```

Export one participant from the backend:

```bash
curl -H "Authorization: Bearer $RESEARCH_EXPORT_TOKEN" \
  "https://YOUR-API/api/research-events/export?participant=P01" \
  -o P01-research-events.ndjson
```

Or use the included command:

```bash
RESEARCH_API_URL=https://YOUR-API \
RESEARCH_EXPORT_TOKEN=YOUR_SECRET \
npm run logs:export -- P01
```

For a deployed backend, the directory must be on a persistent disk. A serverless
or ephemeral filesystem should use the Supabase option below.

## Supabase storage for remote studies

1. Create a Supabase project.
2. Run `research-logging.sql` in its SQL editor.
3. Add these variables to the backend deployment (never to Vite/frontend env):

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
RESEARCH_EXPORT_TOKEN=replace-with-a-long-random-secret
```

The Express server writes with the server secret key; the browser never receives
database credentials. Export through the protected endpoint above, or export the
`research_events` table from the Supabase dashboard.

## Files available after a study

The participant receives a local file named approximately:

```text
P01_session-..._research-log.json
```

It contains session metadata, the final document, and the complete local event
trace. This is the recovery copy if network submission fails.
