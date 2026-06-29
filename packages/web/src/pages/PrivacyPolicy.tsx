import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function PrivacyPolicy() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const from = (location.state as { from?: string } | null)?.from;
  const backTo = from ?? (isAuthenticated ? "/" : "/login");
  const backLabel = from
    ? "← Back"
    : isAuthenticated
      ? "← Back to App"
      : "← Back to Login";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            to={backTo}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
          >
            {backLabel}
          </Link>
          <span className="text-sm font-medium">DB90</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
          DRAFT — pending legal review. Not final.
        </div>

        <h1 className="mb-2 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: TBD</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="mb-2 text-base font-semibold">1. Introduction</h2>
            <p>
              This Privacy Policy explains how DB90 collects, uses, and protects your information
              when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">2. Information We Collect</h2>
            <p>We collect the following categories of information:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Account and identity data (via OIDC)</li>
              <li>Organization and membership data</li>
              <li>Usage telemetry from connected AI coding assistants</li>
              <li>Prompt and assistant content (sanitized)</li>
              <li>Technical and operational logs</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">3. How We Use Information</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Provide analytics and operate the Service</li>
              <li>Cost attribution and retention enforcement</li>
              <li>Security monitoring</li>
              <li>Legal compliance</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">4. Legal Bases (GDPR)</h2>
            <p>
              Contract performance, legitimate interests, and consent where required.
              [Confirm with legal]
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">5. Sensitive Content & Secret Redaction</h2>
            <p>
              An automated sanitizer redacts secrets and PII before storage. Redaction is not
              perfect — avoid submitting secrets or sensitive personal data through the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">6. Data Sharing</h2>
            <p>
              We do not sell your data. Data is shared with sub-processors under agreements,
              within your organization by role, or as required by law.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">7. Data Retention</h2>
            <p>
              Retention is governed by your organization's settings and our operational policies.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">8. Security</h2>
            <p>
              We use access controls, OIDC authentication, encryption in transit, and hashed
              ingest tokens to protect your data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">9. International Transfers</h2>
            <p>
              Appropriate safeguards are applied where international transfers are required.
              [Confirm hosting regions]
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">10. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have the right to access, correct, delete,
              export, object to, or restrict processing of your data. Some requests should be
              directed to your organization as the data controller.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">11. Children</h2>
            <p>The Service is not directed to children.</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">12. Contact</h2>
            <p>privacy@example.com [confirm]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">13. Changes to This Policy</h2>
            <p>
              Material changes will be communicated through the Service. The effective date
              will be updated accordingly.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
