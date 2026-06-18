import Link from "next/link";

const updatedAt = "June 18, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen px-6 py-10 md:px-12 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base uppercase leading-tight tracking-[-0.04em]">Agency CRM</p>
            <p className="ui-kicker mt-1">Terms of service</p>
          </div>
          <Link href="/login" className="text-sm text-zinc-500 underline underline-offset-4 transition hover:text-zinc-950">
            Back to login
          </Link>
        </div>

        <div className="mt-8 border-t border-zinc-950 pt-5">
          <h1 className="text-4xl font-normal uppercase leading-none tracking-[-0.055em]">Terms of Service</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-500">
            Effective {updatedAt}. These terms govern access to and use of Agency CRM, operated through dmytro.biz by Dmytro G.
          </p>
        </div>

        <div className="mt-8 space-y-8 text-sm leading-7 text-zinc-700">
          <section>
            <h2 className="text-lg font-medium text-zinc-950">1. Acceptance</h2>
            <p className="mt-2">
              By accessing or using Agency CRM, you agree to these terms. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">2. Service Scope</h2>
            <p className="mt-2">
              Agency CRM is workflow software provided on an “as is” and “as available” basis. Features may change,
              break, be removed, or become unavailable at any time without notice. We are not obligated to maintain any
              specific feature set, uptime target, storage duration, compatibility promise, or support level.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">3. Your Account and Data</h2>
            <p className="mt-2">
              You are responsible for your account, teammates, credentials, data uploads, exports, backups, and any
              activity that happens under your access. You are also responsible for verifying AI output before relying on it.
            </p>
            <p className="mt-2">
              You retain responsibility for the legality, accuracy, and appropriateness of all content stored in the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">4. Acceptable Use</h2>
            <p className="mt-2">
              You may not use the service to break the law, infringe rights, interfere with the platform, reverse engineer
              access controls, abuse AI features, store malicious content, or overload infrastructure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">5. No Warranty</h2>
            <p className="mt-2">
              To the maximum extent permitted by law, Agency CRM, dmytro.biz, and Dmytro G. disclaim all warranties,
              express or implied, including merchantability, fitness for a particular purpose, non-infringement, accuracy,
              availability, security, uninterrupted operation, and freedom from bugs, loss, or corruption.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">6. Backup and Data-Loss Risk</h2>
            <p className="mt-2">
              You use the service at your own risk. You are solely responsible for maintaining independent backups and
              export copies of any business-critical data. Agency CRM, dmytro.biz, and Dmytro G. are not responsible for
              any data loss, data corruption, failed exports, deleted workspaces, interrupted access, or consequences caused
              by outages, bugs, third-party failures, misconfiguration, unauthorized access, or user error.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">7. Limitation of Liability</h2>
            <p className="mt-2">
              To the maximum extent permitted by law, Agency CRM, dmytro.biz, and Dmytro G. will not be liable for any
              indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of revenue,
              profit, goodwill, business opportunity, data, or use, even if advised of the possibility of those damages.
            </p>
            <p className="mt-2">
              To the maximum extent permitted by law, the total aggregate liability of Agency CRM, dmytro.biz, and Dmytro G.
              arising out of or related to the service will not exceed the greater of: (a) the amount you paid for the service
              in the 30 days before the event giving rise to the claim, or (b) USD $50.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">8. Third-Party Services and AI</h2>
            <p className="mt-2">
              The service depends on third-party providers, including hosting, storage, authentication, and optionally AI vendors.
              We are not responsible for third-party downtime, output quality, policy changes, price changes, account suspensions,
              or security incidents outside our direct control.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">9. Suspension and Termination</h2>
            <p className="mt-2">
              We may suspend, restrict, or terminate access at any time, with or without notice, for any operational, legal,
              security, or abuse-related reason. We may also delete inactive or terminated data without further obligation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">10. Indemnity</h2>
            <p className="mt-2">
              You agree to defend, indemnify, and hold harmless Agency CRM, dmytro.biz, and Dmytro G. from claims, liabilities,
              damages, losses, and expenses arising out of your use of the service, your data, your team’s actions, or your
              violation of these terms or applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">11. Changes to Terms</h2>
            <p className="mt-2">
              We may change these terms at any time. Continued use of the service after changes take effect means you accept
              the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">12. Contact</h2>
            <p className="mt-2">
              Questions about these terms can be sent to <a className="underline" href="mailto:hi@dmytro.biz">hi@dmytro.biz</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
