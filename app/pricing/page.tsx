import { pricingTableDualCurrency } from "@/lib/pricing";
import { PricingSection } from "@/components/pricing/pricing-section";

export default function PricingPage() {
  return (
    <PricingSection plans={pricingTableDualCurrency()} />
  );
}
