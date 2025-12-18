import { Button } from "./button";
import { FileQuestion } from "lucide-react";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-900 bg-slate-950/60 p-8 text-center text-slate-300">
      <FileQuestion className="h-10 w-10 text-slate-500" />
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-slate-400">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="secondary">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
