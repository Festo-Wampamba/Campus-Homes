import { uploadToCloudinary } from './cloudinary';

describe('direct upload metadata', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('sends the signed format allowlist unchanged to Cloudinary', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ public_id: 'photo' }) });
    global.fetch = fetchMock;
    await expect(uploadToCloudinary(new File(['image'], 'test.jpg', { type: 'image/jpeg' }), {
      provider: 'cloudinary', cloudName: 'example', apiKey: 'public-key', timestamp: 1,
      folder: 'uploads/user', signature: 'signature', allowedFormats: 'jpg,pdf',
    })).resolves.toEqual({ publicId: 'photo' });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('allowed_formats')).toBe('jpg,pdf');
    expect(body.get('signature')).toBe('signature');
  });

  it('sends the exact MIME as a B2 PUT header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    await uploadToCloudinary(file, { provider: 'b2', uploadUrl: 'https://storage.invalid/signed', publicUrl: 'https://storage.invalid/photo' });
    expect(fetchMock).toHaveBeenCalledWith('https://storage.invalid/signed', { method: 'PUT', body: file, headers: { 'Content-Type': 'image/png' } });
  });

  it('returns the bare private key for a document upload', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const file = new File(['%PDF'], 'id.pdf', { type: 'application/pdf' });
    await expect(uploadToCloudinary(file, { provider: 'b2', uploadUrl: 'https://storage.invalid/signed', storageKey: 'uploads/u1/doc' }))
      .resolves.toEqual({ publicId: 'uploads/u1/doc' });
  });
});
