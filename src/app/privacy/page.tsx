import Link from "next/link";

const updatedAt = "June 18, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 py-10 md:px-12 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base uppercase leading-tight tracking-[-0.04em]">Agency CRM</p>
            <p className="ui-kicker mt-1">Privacy policy</p>
          </div>
          <Link href="/login" className="text-sm text-zinc-500 underline underline-offset-4 transition hover:text-zinc-950">
            Back to login
          </Link>
        </div>

        <div className="mt-8 border-t border-zinc-950 pt-5">
          <h1 className="text-4xl font-normal uppercase leading-none tracking-[-0.055em]">Privacy Policy</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-500">
            Effective {updatedAt}. This policy explains what data Agency CRM collects, how it is used,
            and the limits of the service. Agency CRM is operated through dmytro.biz by Dmytro G.
          </p>
        </div>

        <div className="mt-8 space-y-8 text-sm leading-7 text-zinc-700">
          <section>
            <h2 className="text-lg font-medium text-zinc-950">1. Data We Collect</h2>
            <p className="mt-2">
              We may collect account information such as email address, display name, role, login records,
              and agency membership data. We also store the business data you put into the product, including
              clients, tasks, comments, attachments, onboarding submissions, dossiers, personas, creative requests,
              and operational activity logs.
            </p>
            <p className="mt-2">
              We may also collect technical data such as IP address, browser metadata, device metadata, and service
              logs generated through hosting, authentication, storage, analytics, or abuse prevention systems.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">2. How We Use Data</h2>
            <p className="mt-2">
              We use data to operate the service, authenticate users, send magic links, store workspace content,
              support collaboration features, maintain security, diagnose issues, prevent abuse, and improve the product.
            </p>
            <p className="mt-2">
              If AI features are enabled, relevant inputs may be sent to configured AI providers to generate briefs,
              reports, tasks, or other outputs requested by users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">3. How Data May Be Shared</h2>
            <p className="mt-2">
              Data may be processed by infrastructure and service providers needed to run Agency CRM, such as hosting,
              database, authentication, storage, email, and AI vendors. We do not sell personal data for cash, but
              service providers may process data on our behalf so the product can function.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">4. Retention</h2>
            <p className="mt-2">
              We keep data for as long as reasonably necessary to operate the service, comply with legal obligations,
              resolve disputes, enforce agreements, and maintain backups or security logs. Deleted data may persist in
              backups or internal logs for a limited time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">5. Security</h2>
            <p className="mt-2">
              We use reasonable administrative, technical, and organizational measures to protect data. That said,
              no system is fully secure, and Agency CRM, dmytro.biz, and Dmytro G. do not guarantee that the service
              will be free from breach, loss, corruption, interception, or unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">6. Your Responsibilities</h2>
            <p className="mt-2">
              You are responsible for the data you upload, the permissions you grant to teammates, the third-party
              tools you connect, and maintaining your own backups or exports if the data matters to your business.
              Do not store sensitive information in the service unless you are comfortable with the operational risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">7. Privacy Rights and Requests</h2>
            <p className="mt-2">
              Depending on where you are located, you may have rights to request access, correction, deletion, or export
              of certain personal information. To submit a request, contact <a className="underline" href="mailto:hi@dmytro.biz">hi@dmytro.biz</a>.
            </p>
            <p className="mt-2">
              We may need to verify your identity and may deny or limit requests when the law allows, where fulfilling
              the request would impair security, or where data must be retained for legitimate operational or legal reasons.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">8. Children</h2>
            <p className="mt-2">
              Agency CRM is not intended for children, and you should not use the service if you are under the age
              required to form a binding agreement in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">9. Changes</h2>
            <p className="mt-2">
              We may update this policy from time to time. Continued use of the service after a change means you accept
              the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-zinc-950">10. Contact</h2>
            <p className="mt-2">
              Privacy questions can be sent to <a className="underline" href="mailto:hi@dmytro.biz">hi@dmytro.biz</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
