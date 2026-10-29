import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import mn from '../../../lang/mn.json';

export type Locale = 'en' | 'mn';

const messages = mn as Record<string, string>;

type I18nContextValue = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (message: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function writeLocaleCookie(locale: Locale): void {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = 365 * 24 * 60 * 60;
    document.cookie = `locale=${locale};path=/;max-age=${maxAge};SameSite=Lax`;
    document.documentElement.lang = locale;
}

function applyVars(
    text: string,
    vars?: Record<string, string | number>,
): string {
    if (!vars) {
        return text;
    }

    return Object.entries(vars).reduce(
        (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
        text,
    );
}

export function translate(
    locale: Locale,
    message: string,
    vars?: Record<string, string | number>,
): string {
    if (!message) {
        return message;
    }

    if (locale !== 'mn') {
        return applyVars(message, vars);
    }

    const exact = messages[message];

    if (exact) {
        return applyVars(exact, vars);
    }

    const stock = message.match(
        /^Not enough stock for (.+)\. Available: (.+)\.$/,
    );

    if (stock) {
        return `${stock[1]}-н нөөц хүрэлцэхгүй. Боломжтой: ${stock[2]}.`;
    }

    const deals = message.match(/^(\d+) Special deals created\.$/);

    if (deals) {
        return `${deals[1]} онцгой хямдрал үүслээ.`;
    }

    return applyVars(message, vars);
}

export function I18nProvider({
    initialLocale,
    children,
}: {
    initialLocale: Locale;
    children: ReactNode;
}) {
    const [locale, setLocaleState] = useState<Locale>(initialLocale);

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const value = useMemo<I18nContextValue>(
        () => ({
            locale,
            setLocale: (next) => {
                writeLocaleCookie(next);
                setLocaleState(next);
            },
            t: (message, vars) => translate(locale, message, vars),
        }),
        [locale],
    );

    return (
        <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    );
}

export function paymentMethodName(
    method: string,
    t: (message: string, vars?: Record<string, string | number>) => string,
): string {
    return method
        .split(',')
        .map((part) => {
            const key = part.trim().toLowerCase().replaceAll(' ', '_');

            if (key === 'cash') {
                return t('Cash');
            }

            if (key === 'card') {
                return t('Card');
            }

            if (key.includes('transfer')) {
                return t('Transfer');
            }

            if (part.trim() === '' || part.trim() === '—') {
                return part.trim();
            }

            return t(part.trim());
        })
        .filter(Boolean)
        .join(', ');
}

export function useI18n(): I18nContextValue {
    const context = useContext(I18nContext);

    if (!context) {
        throw new Error('useI18n must be used within I18nProvider');
    }

    return context;
}

export function LanguageSwitch({ className = '' }: { className?: string }) {
    const { locale, setLocale } = useI18n();

    return (
        <div
            className={`inline-flex rounded-lg border border-sidebar-border/70 p-0.5 text-xs font-semibold ${className}`}
            role="group"
            aria-label={locale === 'mn' ? 'Хэл' : 'Language'}
        >
            {(
                [
                    ['mn', 'МН'],
                    ['en', 'EN'],
                ] as const
            ).map(([value, label]) => (
                <button
                    key={value}
                    type="button"
                    onClick={() => setLocale(value)}
                    aria-pressed={locale === value}
                    className={`rounded-md px-2 py-1 ${
                        locale === value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

/** Known shelf categories. Anything else, including product names, is left as written. */
const CATEGORY_LABELS = new Set([
    'Drinks',
    'Snacks',
    'Sets',
    'Special',
    'Other',
    'Beer',
    'Gloves',
]);

export function useCategoryLabel(): (category: string) => string {
    const { t } = useI18n();

    return (category: string) =>
        CATEGORY_LABELS.has(category) ? t(category) : category;
}
