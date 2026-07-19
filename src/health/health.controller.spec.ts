import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { HealthService } from './health.service';

function createHealthServiceStub(checkDatabase: jest.Mock): HealthService {
  return { checkDatabase } as unknown as HealthService;
}

describe('HealthController', () => {
  describe('live', () => {
    it('always returns ok without consulting HealthService', () => {
      const checkDatabase = jest.fn();
      const controller = new HealthController(
        createHealthServiceStub(checkDatabase),
      );

      expect(controller.live()).toEqual({ status: 'ok' });
      expect(checkDatabase).not.toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('returns ok when the database is reachable', async () => {
      const checkDatabase = jest.fn().mockResolvedValue(true);
      const controller = new HealthController(
        createHealthServiceStub(checkDatabase),
      );

      await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    });

    it('throws a 503 with only a minimal, non-identifying body when the database is unreachable', async () => {
      const checkDatabase = jest.fn().mockResolvedValue(false);
      const controller = new HealthController(
        createHealthServiceStub(checkDatabase),
      );

      await expect(controller.ready()).rejects.toThrow(
        ServiceUnavailableException,
      );

      try {
        await controller.ready();
        throw new Error('expected ready() to reject');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const exception = err as ServiceUnavailableException;
        expect(exception.getStatus()).toBe(503);
        expect(exception.getResponse()).toEqual({
          status: 'error',
          check: 'database',
        });
      }
    });
  });
});
