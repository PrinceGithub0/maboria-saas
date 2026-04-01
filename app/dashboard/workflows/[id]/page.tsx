import { WorkflowBuilder } from "@/components/workflows/builder";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkflowEditPage({ params }: PageProps) {
  const { id } = await params;
  return <WorkflowBuilder mode="edit" workflowId={id} />;
}
