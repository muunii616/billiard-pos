import { router } from '@inertiajs/react';

type VisitErrors = Record<string, string | string[]>;

type PostOptions = {
    preserveScroll?: boolean;
    preserveState?: boolean;
    replace?: boolean;
    onSuccess?: () => void;
    onError?: (errors: VisitErrors) => void;
};

/**
 * Inertia POST that always settles. Overlapping visits can cancel callbacks
 * even after the server already applied the change — callers should close
 * mutation modals optimistically and only reopen on onError.
 */
export function inertiaPost(
    url: string,
    data: Record<string, unknown> = {},
    options: PostOptions = {},
): Promise<'success' | 'error' | 'cancelled'> {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (result: 'success' | 'error' | 'cancelled') => {
            if (settled) {
                return;
            }

            settled = true;
            resolve(result);
        };

        router.post(url, data, {
            preserveScroll: options.preserveScroll ?? true,
            preserveState: options.preserveState,
            replace: options.replace,
            onSuccess: () => {
                options.onSuccess?.();
                finish('success');
            },
            onError: (errors) => {
                options.onError?.(errors);
                finish('error');
            },
            onCancel: () => finish('cancelled'),
        });
    });
}
