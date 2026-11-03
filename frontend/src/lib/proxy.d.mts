export function upstreamUrl(base: string, pathname: string, search: string): string | null;
export function requestHeaders(incoming: Headers): Headers;
export function responseHeaders(upstream: Headers): Headers;
