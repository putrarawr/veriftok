# VerifTok

VerifTok is an Indonesian-language installable PWA for reviewing public TikTok links. Its interface separates comment tone, provocation signals, and sourced claim checks. It does not invent a report when the analysis provider is unavailable.

## Run locally

This project has no build step or third-party runtime dependencies. Use Vercel CLI for local development so the `/api/analyze` serverless function is available:

```sh
npx vercel dev
```

Or serve the static files with any local HTTP server to review the interface. The analysis endpoint will only run in a Vercel-compatible environment.

## Connect an analysis provider

Set these environment variables in Vercel Project Settings → Environment Variables:

- `VERIFTOK_ANALYZER_URL`: HTTPS endpoint that accepts `POST` JSON `{ "url": "https://www.tiktok.com/..." }`.
- `VERIFTOK_ANALYZER_TOKEN`: bearer token sent only from the serverless function.

The provider must return JSON with this shape:

```json
{
  "status": "complete",
  "video": { "title": "Optional video title" },
  "comments": {
    "positive": "42%",
    "negative": "31%",
    "hate": "7%",
    "sampleSize": 120,
    "summary": "A short explanation of the reviewed comments.",
    "confidence": "medium"
  },
  "provocation": {
    "level": "medium",
    "explanation": "A short evidence-based explanation.",
    "signals": ["A concrete language or framing signal"],
    "confidence": "medium"
  },
  "claims": [
    {
      "claim": "A checkable claim from the video",
      "verdict": "unverified",
      "explanation": "What the sources establish and what remains uncertain.",
      "confidence": "low",
      "sources": [{ "title": "Source title", "publisher": "Publisher", "url": "https://example.org/source" }]
    }
  ],
  "limitations": ["Comments could not be retrieved for this video."]
}
```

Allowed `status` values are `complete` and `partial`. Comment `confidence` and claim `confidence` accept `low`, `medium`, or `high`. Provocation `level` accepts `low`, `medium`, `high`, or `unknown`. Claim `verdict` accepts `supported`, `false`, `misleading`, `unverified`, or `mixed`. Use `limitations` when a section could not be checked. Include sample size and explain data coverage; do not present automated labels as definitive.

The provider endpoint should retrieve TikTok data using an authorized method and perform analysis with evidence-backed sources. VerifTok does not store submitted URLs or reports. The configured provider will receive the URL, so review its retention policy before connecting it. Do not expose provider credentials in browser code. For a public deployment, configure request limits for `/api/analyze` at the provider or deployment layer to protect upstream quotas.

## Deploy to Vercel

Import this repository as a Vercel project. Select the **Other** framework preset; no build command is required. Add the provider variables above when an analyzer is available, then deploy. Without them, the PWA remains usable and clearly reports that live analysis is not configured.
