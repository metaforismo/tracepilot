# Product Screenshots

Date: 2026-06-28

These screenshots show the current TracePilot Studio product surfaces. They are committed under `docs/assets/` so reviewers can inspect the UI without running the local app first.

## Studio Overview

The overview is the first surface for opening traces, checking readiness, and reviewing provider evidence.

![TracePilot Studio overview](assets/studio-run-launcher.png)

## Trace Replay

The replay view shows screenshots, step timeline, action JSON, verifier status, and model metadata for a selected run.

![TracePilot trace replay](assets/studio-trace-replay.png)

## Readiness Gate

The readiness gate turns reliability and provider evidence into operational decisions such as `pass`, `warn`, `fail`, or `blocked`.

![TracePilot readiness gate](assets/studio-readiness-gate.png)

## Provider Scorecard

The provider scorecard keeps provider-backed browser-control evidence separate from deterministic harness evidence.

![TracePilot provider scorecard](assets/studio-provider-scorecard.png)

## Failure Diagnostics

Diagnostics turns failed eval rows into failure categories and intervention owners.

![TracePilot failure diagnostics](assets/studio-diagnostics.png)
