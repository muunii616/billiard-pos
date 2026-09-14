export function jsonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };
    const token = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
        ?.slice('XSRF-TOKEN='.length);

    if (token) {
        headers['X-XSRF-TOKEN'] = decodeURIComponent(token);
    }

    return headers;
}

export async function postJson(url: string, payload: unknown) {
    const response = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(json.message || 'Request failed.');
    }

    return json;
}
