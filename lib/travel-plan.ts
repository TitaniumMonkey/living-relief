import { travelDistance, type TravelMode, type TravelPoint } from './travel.ts';
export function journeyPlan(
  from: TravelPoint,
  to: TravelPoint,
  mode: TravelMode | 'auto',
  places: TravelPoint[],
) {
  if (mode !== 'auto') return [{ from, to, mode }];
  const aguas = places.find((p) => p.id === 'aguas-station')!,
    ollanta = places.find((p) => p.id === 'ollanta-station')!;
  const inGorge = (p: TravelPoint) => p.lon < -72.49 && p.lat > -13.205;
  const localMode = (a: TravelPoint, b: TravelPoint): TravelMode =>
    inGorge(a) || travelDistance([a.lon, a.lat], [b.lon, b.lat]) < 1500
      ? 'walk'
      : 'drive';
  if (inGorge(from) === inGorge(to))
    return [{ from, to, mode: localMode(from, to) }];
  const startStation = inGorge(from) ? aguas : ollanta,
    endStation = inGorge(to) ? aguas : ollanta;
  const legs: { from: TravelPoint; to: TravelPoint; mode: TravelMode }[] = [];
  if (
    travelDistance([from.lon, from.lat], [startStation.lon, startStation.lat]) >
    30
  )
    legs.push({ from, to: startStation, mode: localMode(from, startStation) });
  legs.push({ from: startStation, to: endStation, mode: 'train' });
  if (travelDistance([to.lon, to.lat], [endStation.lon, endStation.lat]) > 30)
    legs.push({ from: endStation, to, mode: localMode(endStation, to) });
  return legs;
}
