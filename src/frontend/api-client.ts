import { ApiRoutes } from '../shared/view-types.js';

type ExtractParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<Rest>]: string | number }
    : Path extends `${string}:${infer Param}`
      ? { [K in Param]: string | number }
      : Record<string, never>;

export async function apiFetch<Path extends keyof ApiRoutes>(
  path: Path,
  params: ExtractParams<Path>
): Promise<ApiRoutes[Path]['response']> {
  let url: string = path;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`:${key}`, String(value));
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API request failed with status ${res.status}`);
  }
  return res.json();
}
