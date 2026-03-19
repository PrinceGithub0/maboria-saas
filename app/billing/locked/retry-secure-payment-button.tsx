"use client";

export function RetrySecurePaymentButton() {
  const handleRetry = async () => {
    try {
      const endpoints = ["/api/billing/create-session", "/api/checkout/session", "/api/checkout"];
      const errors: string[] = [];
      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        const checkoutUrl = data?.checkoutUrl || data?.redirectUrl;
        if (res.ok && checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        const errorText = typeof data?.error === "string" ? data.error : `Request failed (${res.status})`;
        errors.push(`${endpoint}: ${errorText}`);
      }
      console.error("Retry payment failed: Missing checkout URL", errors);
    } catch (error) {
      console.error("Retry payment failed:", error);
    }
  };

  return (
    <button
      onClick={handleRetry}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
    >
      Retry Secure Payment
    </button>
  );
}
