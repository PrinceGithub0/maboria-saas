export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-foreground">
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

      <p>
        This Privacy Policy describes how Maboria Inc. (&quot;Company&quot;, &quot;we&quot;) collects, uses, and
        shares your information when you use the Service.
      </p>

      <h2 className="text-xl font-semibold">Information We Collect</h2>
      <p>Account data, billing information, usage analytics, logs, and content processed via automations.</p>

      <h2 className="text-xl font-semibold">How We Use Information</h2>
      <p>To provide the Service, process payments, improve features, secure the platform, and comply with law.</p>

      <h2 className="text-xl font-semibold">Sharing</h2>
      <p>We share with processors (payments, hosting, AI vendors) under data protection agreements.</p>

      <h2 className="text-xl font-semibold">Security</h2>
      <p>We employ encryption in transit, access controls, logging, and regular security reviews.</p>

      <h2 className="text-xl font-semibold">Data Retention</h2>
      <p>We retain data as long as needed for the Service or as required by law.</p>

      <h2 className="text-xl font-semibold">Your Rights</h2>
      <p>You may access, correct, or delete your data, subject to legal obligations.</p>

      <h2 className="text-xl font-semibold">International Transfers</h2>
      <p>Data may be processed globally with adequate safeguards.</p>

      <h2 className="text-xl font-semibold">Contact</h2>
      <p>Email: privacy@maboria.com • Address: [Insert company address and registration details]</p>
    </div>
  );
}

