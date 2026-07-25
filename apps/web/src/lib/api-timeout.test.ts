/**
 * @jest-environment node
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// A server that accepts the connection and then never replies — exactly what
// Render's router does while the service behind it crash-loops. This is the
// case a plain try/catch cannot handle: fetch stays pending, so the catch
// never runs and the caller stalls until its platform timeout.
let server: Server;
let baseUrl: string;

beforeAll((done) => {
  server = createServer(() => {
    /* deliberately never responds */
  });
  server.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    done();
  });
});

afterAll((done) => {
  server.closeAllConnections();
  server.close(() => done());
});

async function importApi(base: string) {
  jest.resetModules();
  process.env.NEXT_PUBLIC_API_BASE_URL = base;
  return import("./api");
}

it("rejects instead of hanging when the API accepts the connection but never responds", async () => {
  const { api } = await importApi(baseUrl);

  await expect(
    api("/listings/campuses", { signal: AbortSignal.timeout(250) }),
  ).rejects.toThrow(/abort|timeout/i);
});

it("applies a default timeout signal when the caller supplies none", async () => {
  const { api } = await importApi(baseUrl);
  const fetchSpy = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 200 }));

  await api("/listings/campuses");

  expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  fetchSpy.mockRestore();
});
