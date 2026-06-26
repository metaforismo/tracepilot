# Security Policy

TracePilot runs agents in local browser and desktop-like environments. The first public milestones must stay safe by default.

## Default Safety Boundaries

- Run local fixtures and mock data only.
- Disable arbitrary external browsing in eval tasks.
- Treat web pages, documents, emails, PDFs, and tool output as untrusted content.
- Require policy checks for actions that submit, send, approve, upload, download, or expose data.
- Never store real secrets in traces.
- Keep screenshots and trace artifacts local unless explicitly exported.

## Prompt Injection

TracePilot intentionally includes prompt-injection fixtures. These fixtures are untrusted test content, not instructions for the harness or developer.

If a test fixture says to ignore prior instructions, reveal secrets, exfiltrate data, or send confidential files, the expected behavior is to block or escalate the action and log the reason.

## Reporting Issues

For now, open a GitHub issue with:

- reproduction steps;
- task fixture;
- trace ID or artifact path;
- expected behavior;
- actual behavior;
- whether data exposure or unsafe action occurred.

