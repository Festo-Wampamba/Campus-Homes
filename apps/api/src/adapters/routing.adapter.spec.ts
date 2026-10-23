/**
 * Google Routes daily cap: a 429 pauses lookups for an hour (refused calls
 * are free), alerts the owner once per cap, and resumes on its own.
 */
import { GoogleRoutes } from './routing.adapter';

const A = { lat: 0.3142, lon: 32.637 };
const B = { lat: 0.3345, lon: 32.5687 };
const HOUR = 60 * 60 * 1000;
const capped = () => new Response('{}', { status: 429 });
const routed = () => new Response(JSON.stringify({ routes: [{ distanceMeters: 10032, duration: '1500s' }] }), { status: 200 });

let fetchMock: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-23T08:00:00Z') });
  fetchMock = jest.spyOn(global, 'fetch');
});

afterEach(() => {
  jest.useRealTimers();
  fetchMock.mockRestore();
});

describe('GoogleRoutes daily cap', () => {
  it('returns no route instead of failing when the cap is reached', async () => {
    fetchMock.mockResolvedValue(capped());

    await expect(new GoogleRoutes('key').drivingRoute(A, B)).resolves.toBeNull();
  });

  it('stops calling Google while paused', async () => {
    fetchMock.mockImplementation(async () => capped());
    const routes = new GoogleRoutes('key');

    await routes.drivingRoute(A, B);
    await routes.drivingRoute(A, B);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('alerts the owner once while the cap lasts, not on every hourly retry', async () => {
    fetchMock.mockImplementation(async () => capped());
    const alert = jest.fn();
    const routes = new GoogleRoutes('key', alert);

    await routes.drivingRoute(A, B);
    jest.advanceTimersByTime(HOUR + 1);
    await routes.drivingRoute(A, B);

    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('resumes once the pause is over and Google answers again', async () => {
    fetchMock.mockResolvedValueOnce(capped()).mockResolvedValueOnce(routed());
    const routes = new GoogleRoutes('key');

    await routes.drivingRoute(A, B);
    jest.advanceTimersByTime(HOUR + 1);

    await expect(routes.drivingRoute(A, B)).resolves.toEqual({ distanceMeters: 10032, durationSeconds: 1500 });
  });

  it('alerts again when a later day hits the cap', async () => {
    fetchMock.mockResolvedValueOnce(capped()).mockResolvedValueOnce(routed()).mockResolvedValueOnce(capped());
    const alert = jest.fn();
    const routes = new GoogleRoutes('key', alert);

    await routes.drivingRoute(A, B);
    jest.advanceTimersByTime(HOUR + 1);
    await routes.drivingRoute(A, B);
    await routes.drivingRoute(A, B);

    expect(alert).toHaveBeenCalledTimes(2);
  });
});
