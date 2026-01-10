"use client";

import { Button } from "./button";
import { FileQuestion } from "lucide-react";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-card p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)] max-md:rounded-[28px]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-foreground shadow-sm">
        {icon || <FileQuestion className="h-6 w-6" />}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="secondary">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
