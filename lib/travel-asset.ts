import type { TravelNetwork } from './travel.ts';

/** Fetch already decodes HTTP gzip; static hosts may instead serve the raw gzip file. */
export async function readTravelNetwork(
  response: Response,
): Promise<TravelNetwork> {
  if (!response.ok)
    throw new Error('Bundled travel map could not load. Retry the journey.');
  if (response.headers.get('content-encoding')?.includes('gzip'))
    return response.json();
  return new Response(
    response.body!.pipeThrough(new DecompressionStream('gzip')),
  ).json();
}
