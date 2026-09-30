import { openDocument } from './documents';

describe('openDocument', () => {
  const originalFetch = global.fetch;
  const originalOpen = window.open;
  afterEach(() => {
    global.fetch = originalFetch;
    window.open = originalOpen;
  });

  function fakeTab() {
    const tab = { opener: {} as unknown, location: { href: '' }, closed: false, close: () => { tab.closed = true; } };
    return tab;
  }

  it('requests a presigned URL for the url-encoded key', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://b2.invalid/doc?sig' }) });
    global.fetch = fetchMock;
    window.open = jest.fn().mockReturnValue(fakeTab());
    await openDocument('uploads/u1/a b');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/uploads/document-url?key=uploads%2Fu1%2Fa%20b');
  });

  it('navigates the pre-opened tab to the presigned URL without an opener', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://b2.invalid/doc?sig' }) });
    const tab = fakeTab();
    window.open = jest.fn().mockReturnValue(tab);
    await openDocument('uploads/u1/doc');
    expect(tab).toMatchObject({ opener: null, location: { href: 'https://b2.invalid/doc?sig' } });
  });

  it('closes the pre-opened tab and rethrows when access is refused', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'no' }) });
    const tab = fakeTab();
    window.open = jest.fn().mockReturnValue(tab);
    await expect(openDocument('uploads/u2/doc')).rejects.toMatchObject({ status: 403 });
    expect(tab.closed).toBe(true);
  });
});
