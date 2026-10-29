import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import { I18nProvider } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import '../css/app.css';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob('./pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        const locale: Locale =
            props.initialPage.props.locale === 'en' ? 'en' : 'mn';

        root.render(
            <StrictMode>
                <I18nProvider initialLocale={locale}>
                    <TooltipProvider delayDuration={0}>
                        <App {...props} />
                    </TooltipProvider>
                </I18nProvider>
            </StrictMode>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});

initializeTheme();

if (import.meta.env.PROD) {
    void import('virtual:pwa-register')
        .then(({ registerSW }) => {
            registerSW({ immediate: true });
        })
        .catch(() => {
            // PWA register is optional; ignore if unavailable.
        });
}
