import type { ReactNode } from 'react';

type PageHeaderProps = {
    title: string;
    description?: string;
    children?: ReactNode;
};

export function PageHeader({ title, description, children }: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {children ? (
                <div className="flex flex-wrap items-center gap-2">
                    {children}
                </div>
            ) : null}
        </div>
    );
}
