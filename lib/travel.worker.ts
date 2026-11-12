import { readTravelNetwork } from './travel-asset';
import { findTravelLeg } from './travel-routing';
import type { TravelNetwork, TravelPoint, TravelMode } from './travel';
let network: Promise<TravelNetwork> | undefined;
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    from: TravelPoint;
    to: TravelPoint;
    legs: { from: TravelPoint; to: TravelPoint; mode: TravelMode }[];
  }>,
) => {
  const request = event.data;
  try {
    network ??= fetch('/travel/network.json.gz').then(readTravelNetwork);
    const data = await network;
    const legs = request.legs.map((leg) =>
      findTravelLeg(data, leg.from, leg.to, leg.mode),
    );
    self.postMessage({
      id: request.id,
      journey: {
        from: request.from,
        to: request.to,
        legs,
        distance: legs.reduce((sum, leg) => sum + leg.distance, 0),
      },
    });
  } catch (error) {
    network = undefined;
    self.postMessage({
      id: request.id,
      error:
        error instanceof Error ? error.message : 'Route preparation failed.',
    });
  }
};
