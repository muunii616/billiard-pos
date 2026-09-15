import { Link } from '@inertiajs/react';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-br from-emerald-950/95 via-slate-900 to-slate-900 p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(16,185,129,0.12),transparent)]"
                aria-hidden
            />
            <div className="relative w-full max-w-[400px]">
                <div className="rounded-2xl border border-white/10 bg-card/95 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-4">
                            <Link
                                href={home()}
                                className="flex items-center gap-3 rounded-lg no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                <div className="flex h-12 w-12 items-center justify-center">
                                    <img
                                        src="/logo-ui.png"
                                        alt="Lox Billiard"
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <span className="text-lg font-semibold tracking-tight text-foreground">
                                    Lox Billiard
                                </span>
                            </Link>
                            <div className="space-y-1">
                                <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                                    {title}
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    {description}
                                </p>
                            </div>
                        </div>
                        {children}
                    </div>
                </div>
                <p className="mt-6 text-center text-xs text-muted-foreground/80">
                    Table management and point of sale
                </p>
            </div>
        </div>
    );
}
