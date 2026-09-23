# VerifTok PWA Design

## Goal

Build a Progressive Web App for people who want help evaluating potentially misleading or provocative TikTok videos. A user submits a TikTok URL and receives a clear, cautious report about comment tone, provocation, and claims that can be checked against external sources. The app should be deployable to Vercel.

## Product principles

- Separate observable signals (comment tone and provocation) from factual conclusions.
- Show the claim, supporting and contradicting evidence, source links, and confidence for each fact-check finding.
- Do not present generated or sample output as a real analysis.
- If a required provider is not configured or cannot retrieve the video data, explain that state and preserve the submitted URL for recovery.
- Treat a high provocation or misinformation signal as an indicator for review, not proof of intent or falsity.

## Recommended architecture

Use a Next.js PWA deployed on Vercel. The browser owns the submission flow, report display, and installable app shell. A Vercel serverless endpoint validates TikTok URLs and coordinates provider adapters. Provider credentials stay server-side in Vercel environment variables.

The analysis flow is:

1. The user pastes a TikTok link and submits it.
2. The app validates the URL and shows a pending state.
3. The server endpoint requests available video and comment data through a configured TikTok data provider.
4. Analysis and source-search adapters identify comment sentiment/hate indicators, provocative framing, and checkable claims.
5. The endpoint returns a structured report with evidence, linked sources, confidence, and any unavailable sections.
6. The app presents the report and allows the user to open each cited source.

Provider interfaces must be isolated so a service can be selected or replaced without changing the report UI. The first implementation can define these integration boundaries and honest unconfigured states; real analysis requires configured provider credentials and must never silently fall back to fabricated findings.

## Main screen and report

The main screen centers on one task: paste a TikTok URL and request an analysis. The result is organized into:

- Comment tone: positive, negative, and hate indicators, with the limits of the available comments stated.
- Provocation: signals in the video's wording or framing, with a short explanation.
- Fact check: extracted claims, evidence supporting or challenging them, source links, and confidence.
- Coverage: sections that could not be checked and why.

Avoid a single overall “hoax score” that hides uncertainty. Use named findings and plain-language explanations instead. Demo/example data, if added later, must be visibly labeled as an example and must not appear as a submitted URL's real result.

## States and recovery

- Empty: explain that the user can paste a public TikTok link.
- Invalid link: explain which URL format is accepted and keep the input editable.
- Pending: indicate that data is being retrieved and analyzed.
- Partial report: show available sections and identify missing data or failed providers.
- Provider unavailable/unconfigured: state that real analysis is not ready, keep the URL, and give a clear retry path.
- Complete report: show findings with source links and confidence.
- Network/server error: preserve the URL and provide a retry action.

## PWA and deployment

Provide a web app manifest, installable app metadata/icons, and a service worker for the app shell. Offline use should explain that a new analysis needs an internet connection; no cached analysis should be implied to be current. Deploy the web app and serverless endpoint together on Vercel. Document the required environment-variable names and provider setup without committing secrets.

## Privacy and data handling

Do not persist submitted URLs or analysis reports on a server in the initial version. Keep in-progress input in the current session. Any later history feature requires a separate product decision and clear retention behavior.

## Out of scope for this first project slice

- A moderation, reporting, or takedown workflow for TikTok.
- User accounts, shared history, or a database.
- Claims that automated sentiment or fact-checking is definitive.
- A fabricated “working” analysis while external providers are absent.

## Acceptance criteria

- A user can install/open VerifTok as a PWA and submit a TikTok URL.
- Invalid URLs receive a useful explanation without losing the input.
- The Vercel endpoint returns a structured report or an explicit unavailable/error state.
- The report keeps comment sentiment, provocation, and factual evidence distinct.
- Each factual finding exposes its sources and confidence; unavailable evidence is labeled.
- No sample output is presented as analysis of the user's submitted video.
- The app is usable on narrow and wide screens, with keyboard-accessible form controls and visible focus.
- Secrets are read only by server-side code and are supplied through deployment environment variables.
