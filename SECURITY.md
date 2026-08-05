# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch. Older
releases are not guaranteed to receive backported fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Instead, report them privately using GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" under the repository's **Security** tab).

When reporting, please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a proof of concept.
- Any affected versions, components (API, web, `@aixle/insights`), or configurations.

## What to expect

- We will acknowledge your report as soon as we are able.
- We will investigate and keep you informed of our progress.
- Once a fix is available, we will coordinate disclosure with you.

We appreciate responsible disclosure and will credit reporters who wish to be
acknowledged.

## Handling of sensitive data

Aixle Insights processes coding-assistant telemetry. Prompt and command text is
subject to sanitization before persistence (see the data-pipeline design docs
under `docs/data-pipeline/`). If you discover a data-handling or sanitization
gap, please treat it as a security issue and report it privately as described
above.
