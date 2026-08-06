# Privacy Policy — Aixle Insights

**Last updated:** August 4, 2026 · **Effective:** August 1, 2026

## 1. Who We Are

Aixle Insights ("the Service") is provided by Dualboot Partners, LLC ("Dualboot," "we," "us"), 5540 Centerview Dr., Ste. 204, #24754, Raleigh, NC 27606.

## 2. Two Deployment Models

The Service is available in two forms, and our role differs between them. This distinction determines most of what follows.

**Hosted (we operate it):** We run the infrastructure. Our role under GDPR is Processor on behalf of the customer organization, which is the controller. We are an independent controller only for account and billing data. What we can see is everything described in Section 3. This policy applies in full.

**Self-hosted (you operate it):** You run the infrastructure, on your own systems. We are neither controller nor processor — we do not receive, access, or store your data, unless installation telemetry is enabled (see Section 8). This policy applies only to Sections 1, 8, 9, and 10.

The Service's source code is available under the Apache License 2.0. If you deploy it yourself, we have no visibility into your data and no ability to access it, and you are the controller for all data you process with it.

## 3. What We Collect (Hosted Deployments)

**3.1 Account and identity data.** Collected when a user signs in via your identity provider (we use OpenID Connect; Google is a supported provider): email address, display name, profile picture URL, identity-provider subject identifier, timestamps of account creation, last sign-in, and last login, and role within the organization.

**3.2 Organization and project configuration.** Organization name and settings; projects; repository names and URLs; connected integrations (source-control, issue-tracker, and cloud providers); membership and roles; API and ingest credentials in hashed form.

**3.3 AI-assistant usage events.** For each interaction a developer has with a connected AI coding assistant: which tool (e.g. Claude Code, Cursor, GitHub Copilot), model name, input, output, and total token counts, computed cost, event type, timestamp, duration, associated project and repository, and the identity of the developer.

**3.4 Prompt and response content.** The text of prompts a developer sends to their AI assistant, and the assistant's responses, including session transcripts. This content is stored and retained.

We scan this content to flag likely secrets and personal data, and attach a risk label. The scan labels content; it does not remove it. Content flagged as high-risk is stored in the same form as any other content.

Because this content is whatever a developer typed, it may contain information we cannot anticipate — including source code, credentials, customer data, and personal data relating to people who are not our users. We do not seek this data and cannot control what appears in it.

Our [Terms of Service](TERMS_OF_SERVICE.md) require customers not to knowingly submit special-category personal data (as defined under Article 9 of the GDPR), payment-card data, or regulated health data to the Service. Because prompt content is captured as typed, we cannot verify or enforce compliance with that restriction at the point of submission, and this section describes what may occur in practice notwithstanding that contractual restriction.

**3.5 Technical and diagnostic data.** Server logs, IP addresses, request metadata, and error reports (including stack traces and, potentially, request context). Retained for security, debugging, and abuse prevention.

**3.6 What we do not collect.** We do not collect payment-card data directly. We do not use advertising or cross-site tracking technologies. We do not sell personal data.

## 4. Why We Process It; Legal Basis

| Purpose | Data | Legal basis (GDPR) |
|---|---|---|
| Providing the Service to the customer organization | Sections 3.1–3.4 | Performance of a contract (Art. 6(1)(b)); for individual developers, the customer's legitimate interest (Art. 6(1)(f)), subject to Section 5 of our [Terms of Service](TERMS_OF_SERVICE.md) |
| Authentication and access control | Section 3.1 | Contract; legitimate interest (Art. 6(1)(f)) |
| Cost and usage analytics presented to the customer organization | Sections 3.2–3.3 | Performance of a contract (Art. 6(1)(b)) |
| Security, abuse prevention, and debugging | Sections 3.1, 3.5 | Legitimate interest (Art. 6(1)(f)) |
| Improving the Service | Aggregated and de-identified data only | Legitimate interest (Art. 6(1)(f)) |
| Legal and regulatory compliance | As required | Legal obligation (Art. 6(1)(c)) |

We do not rely on any legal basis for using prompt or response content to train machine-learning models, because we do not do so. Section 4.4 of our [Terms of Service](TERMS_OF_SERVICE.md) commits us not to.

## 5. Sub-processors and Third Parties

Company may engage third-party service providers, contractors, and subprocessors ("Subprocessors") to perform functions and provide services to Company in connection with the Service.

Company may add, remove, or replace Subprocessors from time to time as necessary to operate and improve the Service. Where Company processes personal data on behalf of a customer as a data processor under applicable data protection law, the specific terms governing Subprocessor engagement, notice, and objection rights are set forth in the applicable Data Processing Addendum, which shall control over this Section in the event of any conflict.

## 6. Retention

We retain the data described in Section 3 for as long as your organization maintains an account, except where a shorter period applies under the retention controls described below.

| Data | Retention |
|---|---|
| Account and organization data (Sections 3.1–3.2) | For the life of the account |
| Usage events, and the prompt and response content stored with them (Sections 3.3–3.4) | **90 days by default.** Configurable by your organization — and, independently, per project — to 30, 60, 90, 180, 365, or 730 days. Whichever period applies, deletion is enforced automatically, and a record of each purge is retained. |
| Hourly aggregates (counts and costs, no content) | 365 days by default; configurable to 90, 180, 365, or 730 days |
| Daily aggregates (counts and costs, no content) | Retained indefinitely by default; configurable to 365, 730, or 1,095 days |
| Technical and diagnostic data (Section 3.5) | Per the retention period of our error-monitoring provider |

A global maximum retention period applies to usage events across the Service; where an organization or project is configured for a longer period, the global maximum governs.

Aggregates contain event counts, token totals, and costs. They contain no prompt or response content.

You may ask us to delete your data or your account at any time using the contact details in Section 13, and we will do so except where we are required to retain data by law. On termination, our retention obligations are as set out in Section 13.3 of our [Terms of Service](TERMS_OF_SERVICE.md).

## 7. Your Rights

Depending on your location you may have rights to access, correct, delete, port, restrict, or object to the processing of your personal data, and to withdraw consent where processing relies on it.

**If you are a developer whose usage is tracked:** the customer organization that deployed the Service is the controller of that data. Requests should ordinarily be directed to your employer. We will assist them and will not respond directly except where required by law or instructed by the controller. Contact us using the details in Section 13 if you cannot reach the controller.

The customer organization's obligations to its personnel regarding notice, consultation, and legal basis for this monitoring — including any works council or employee-representative consultation required by Applicable Law — are addressed in Section 5 (Employee and Personnel Monitoring) of our [Terms of Service](TERMS_OF_SERVICE.md), which the customer organization agrees to as a condition of using the Service.

Complaints may be lodged with your local supervisory authority.

## 8. Reserved.

## 9. International Transfers

We are a US-based company. If you access the Service from outside the United States, your personal data will be transferred to, stored, and processed in the United States, and may be transferred to other jurisdictions where our sub-processors operate (see Section 5).

Where a transfer involves personal data originating in the European Economic Area, the United Kingdom, or Switzerland to a country not recognized as providing an adequate level of data protection, we will implement an appropriate transfer mechanism recognized under Applicable Law — such as the European Commission's Standard Contractual Clauses, the UK International Data Transfer Addendum, or a valid EU-U.S. Data Privacy Framework self-certification — before making such transfer.

## 10. Security

We maintain technical and organizational measures designed to protect the data described in Section 3, including encryption of data in transit, storage of API and ingest credentials in hashed form, authentication through a managed identity provider, access controls limiting internal access to personal data on a need-to-know basis, and network security controls appropriate to a hosted service.

Providing the Service inherently requires processing the content of prompts and responses exchanged with connected AI assistants (see Section 3.4) — this is a necessary consequence of the Service's core function of monitoring and reporting on AI-assistant usage, not a byproduct of how we handle security. We do not currently offer client-side redaction of this content before it reaches our servers; a risk-scanning feature labels content that may contain secrets or personal data, but does not remove or alter it. As a result, prompt and response content may contain information you or your personnel did not intend to share with us, including information relating to third parties. We describe this here so that customers and their personnel can make an informed decision about what to submit to connected AI assistants in an environment where the Service is deployed. We may introduce client-side redaction capabilities in the future; until then, this section reflects current practice.

We use a third-party provider for error monitoring and diagnostics (see Section 5). Diagnostic reports may include request context, and we do not represent that sensitive fields are removed from them before they reach that provider.

No method of transmission or storage is completely secure, and we cannot guarantee the absolute security of your data.

## 11. Children

The Service is not directed to individuals under the age of 18, and we do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us using the details in Section 13 and we will take steps to investigate and, where appropriate, delete it.

## 12. Changes

We may update this Privacy Policy from time to time. If we make material changes, we will provide reasonable notice (for example, by email to the account administrator or an in-app notice) before the changes take effect. The "Last updated" date above indicates when this Policy was last revised.

## 13. Contact

Questions about this Privacy Policy, or requests relating to your personal data, should be directed to: Dualboot Partners, LLC, 5540 Centerview Dr., Ste. 204, #24754, Raleigh, NC 27606.
