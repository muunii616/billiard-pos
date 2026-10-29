import { createInertiaApp } from '@inertiajs/react';
import createServer from '@inertiajs/react/server';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import ReactDOMServer from 'react-dom/server';
import { TooltipProvider } from '@/components/ui/tooltip';
import { I18nProvider } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createServer((page) =>
    createInertiaApp({
        page,
        render: ReactDOMServer.renderToString,
        title: (title) => (title ? `${title} - ${appName}` : appName),
        resolve: (name) =>
            resolvePageComponent(
                `./pages/${name}.tsx`,
                import.meta.glob('./pages/**/*.tsx'),
            ),
        setup: ({ App, props }) => {
            const locale: Locale =
                props.initialPage.props.locale === 'en' ? 'en' : 'mn';

            return (
                <I18nProvider initialLocale={locale}>
                    <TooltipProvider delayDuration={0}>
                        <App {...props} />
                    </TooltipProvider>
                </I18nProvider>
            );
        },
    }),
);
