import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AppRoutes } from "@/lib/routes";

export function TermsOfService() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const from = (location.state as { from?: string } | null)?.from;
  const backTo = from ?? (isAuthenticated ? AppRoutes.dashboard : AppRoutes.login);
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
          <span className="text-sm font-medium">Aixle Insights</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
          DRAFT — pending legal review. Not final.
        </div>

        <h1 className="mb-2 text-3xl font-bold">Terms of Service</h1>
        <p className="mb-10 text-sm text-muted-foreground">Effective date: TBD</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="mb-2 text-base font-semibold">1. Acceptance of Terms</h2>
            <p>
              Governs access to the Aixle Insights platform, operated by Acme Corp / [legal entity TBD].
              By using the Service you agree to these Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">2. Description of the Service</h2>
            <p>
              AI coding-assistant analytics platform ingesting telemetry from connected tools
              (Claude Code, Cursor, GitHub Copilot, OpenAI, Gemini).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">3. Accounts and Organizations</h2>
            <p>
              The organization owner is responsible for membership, connected tools, and
              data-retention settings.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">4. Acceptable Use</h2>
            <p>
              No unauthorized access, security probing, interference, or submission of data
              without rights.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">5. Customer Data</h2>
            <p>
              You retain ownership of your data; you grant a limited license to process it for
              Service delivery per the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">6. Open Source</h2>
            <p>Portions of the Service are distributed as open source under their respective licenses.</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">7. Third-Party Services</h2>
            <p>
              Your use of third-party services is governed by their terms; we are not responsible
              for third-party services.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">8. Service Availability and Changes</h2>
            <p>We may modify or suspend the Service with reasonable notice.</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">9. Disclaimers</h2>
            <p>
              The Service is provided "as is". Cost and usage figures are estimates.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">10. Limitation of Liability</h2>
            <p>
              No indirect or incidental damages. Liability cap: TBD.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">11. Termination</h2>
            <p>
              We may suspend your account for breach. Data handling upon termination is governed
              by the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">12. Changes to These Terms</h2>
            <p>Material changes will be communicated through the Service.</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">13. Governing Law</h2>
            <p>[Jurisdiction TBD]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">14. Contact</h2>
            <p>legal@example.com [confirm]</p>
          </section>
        </div>
      </main>
    </div>
  );
}
