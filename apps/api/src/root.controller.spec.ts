import { RootController } from './root.controller';

describe('RootController', () => {
  it('returns the service status and health path', () => {
    expect(new RootController().status()).toEqual({
      service: 'campushomes-api',
      status: 'online',
      health: '/api/v1/health',
    });
  });
});
