import { AutomationBuilder } from "@/components/automations/automation-builder";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AutomationEditPage({ params }: PageProps) {
  const { id } = await params;
  return <AutomationBuilder mode="edit" automationId={id} />;
}

