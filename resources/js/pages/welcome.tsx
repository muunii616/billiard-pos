import { Head, Link, usePage } from '@inertiajs/react';
import { dashboard, login } from '@/routes';

export default function Welcome() {
    const { auth } = usePage().props as {
        auth?: { user?: Record<string, unknown> | null };
    };

    return (
        <>
            <Head title="Lox Billiard">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link
                    href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600"
                    rel="stylesheet"
                />
            </Head>
            <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-br from-emerald-950/95 via-slate-900 to-slate-900 p-6 sm:p-8">
                <div
                    className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(16,185,129,0.12),transparent)]"
                    aria-hidden
                />
                {auth?.user && (
                    <header className="absolute top-0 right-0 left-0 flex justify-end p-4 sm:p-6">
                        <Link
                            href={dashboard()}
                            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                        >
                            Dashboard
                        </Link>
                    </header>
                )}

                <main className="relative flex flex-col items-center text-center">
                    <div className="mb-8 flex h-32 w-32 items-center justify-center">
                        <img
                            src="/logo-ui.png"
                            alt="Lox Billiard"
                            className="h-full w-full object-contain"
                        />
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                        Lox Billiard
                    </h1>
                    <p className="mt-3 max-w-sm text-base text-slate-300 sm:text-lg">
                        Table management and point of sale for your billiard
                        hall
                    </p>
                    {!auth?.user && (
                        <div className="mt-10">
                            <Link
                                href={login()}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                            >
                                Log in
                            </Link>
                        </div>
                    )}
                </main>
            </div>
        </>
    );
}
