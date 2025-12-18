export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-slate-100">
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <p className="text-sm text-slate-400">Last updated: {new Date().toLocaleDateString()}</p>
      <p>
        These Terms of Service (“Terms”) govern your access to and use of the Maboria platform (“Service”)
        operated by Maboria Inc. (“Company”, “we”, “us”). By using the Service, you agree to these Terms.
      </p>
      <h2 className="text-xl font-semibold">1. Accounts</h2>
      <p>
        You must provide accurate information. You are responsible for safeguarding your account credentials.
      </p>
      <h2 className="text-xl font-semibold">2. Use of Service</h2>
      <p>
        You agree not to misuse the Service. Automations must comply with applicable laws, including data privacy
        and anti-spam regulations.
      </p>
      <h2 className="text-xl font-semibold">3. Billing</h2>
      <p>
        Paid plans renew automatically unless canceled. Fees are non-refundable except where required by law.
        Usage-based fees may apply.
      </p>
      <h2 className="text-xl font-semibold">4. Data & Privacy</h2>
      <p>
        We process data per our Privacy Policy. You retain ownership of your content; you grant us a license to
        operate the Service.
      </p>
      <h2 className="text-xl font-semibold">5. Termination</h2>
      <p>We may suspend or terminate accounts for violations. You may cancel at any time via your dashboard.</p>
      <h2 className="text-xl font-semibold">6. Disclaimers</h2>
      <p>The Service is provided “as is” without warranties. We are not liable for indirect or consequential loss.</p>
      <h2 className="text-xl font-semibold">7. Changes</h2>
      <p>We may update these Terms. Continued use constitutes acceptance of revised Terms.</p>
      <h2 className="text-xl font-semibold">Contact</h2>
      <p>Email: legal@maboria.com • Address: [Insert company address and registration details]</p>
    </div>
  );
}
