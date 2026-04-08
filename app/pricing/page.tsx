import { PricingSection } from "@/components/pricing/pricing-section";
import { buildPricingPlansForDisplay } from "@/lib/pricing-live";

export default async function PricingPage() {
  const plans = await buildPricingPlansForDisplay();

  return <PricingSection plans={plans} />;
}
