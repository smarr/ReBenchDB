import { ApiRoutes, apiRoutes } from '../shared/routes.js';

type ExtractParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<Rest>]: string | number }
    : Path extends `${string}:${infer Param}`
      ? { [K in Param]: string | number }
      : Record<string, never>;

export async function apiFetch<Path extends keyof ApiRoutes>(
  path: Path,
  params: ExtractParams<Path>,
  jsonData?: any
): Promise<ApiRoutes[Path]['response']> {
  let url: string = path;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`:${key}`, String(value));
  }

  let options: RequestInit | undefined = undefined;
  if (apiRoutes[path].method === 'POST') {
    options = {
      method: 'POST',
      mode: 'same-origin',
      cache: 'no-cache',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify(jsonData)
    };
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`API request failed with status ${res.status}`);
  }
  return res.json();
}
