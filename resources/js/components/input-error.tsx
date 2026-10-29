import type { HTMLAttributes } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function InputError({
    message,
    className = '',
    ...props
}: HTMLAttributes<HTMLParagraphElement> & { message?: string }) {
    const { t } = useI18n();

    return message ? (
        <p
            {...props}
            className={cn('text-sm text-red-600 dark:text-red-400', className)}
        >
            {t(message)}
        </p>
    ) : null;
}
