import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type EmptyStateProps = {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
};

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
            {Icon ? (
                <Icon className="mb-3 h-8 w-8 text-muted-foreground" />
            ) : null}
            <p className="font-medium">{title}</p>
            {description ? (
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    {description}
                </p>
            ) : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}
