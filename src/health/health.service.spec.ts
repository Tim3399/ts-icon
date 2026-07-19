import { HealthService } from './health.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MetricsService } from '../metrics/metrics.service';

function createPrismaStub(findFirst: jest.Mock): PrismaService {
  return {
    channelImage: { findFirst },
  } as unknown as PrismaService;
}

// Hands back the jest.fn() reference directly (rather than reading
// `metrics.databaseErrorsTotal.inc` back off the object later) to sidestep
// @typescript-eslint/unbound-method, same as this repo's other specs that
// stub a class with method-shaped properties.
function createMetricsStub(): { metrics: MetricsService; inc: jest.Mock } {
  const inc = jest.fn();
  const metrics = {
    databaseErrorsTotal: { inc },
  } as unknown as MetricsService;
  return { metrics, inc };
}

describe('HealthService', () => {
  it('returns true when the database query succeeds', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { metrics, inc } = createMetricsStub();
    const service = new HealthService(createPrismaStub(findFirst), metrics);

    await expect(service.checkDatabase()).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(inc).not.toHaveBeenCalled();
  });

  it('returns false, without throwing, when the database query rejects, and records a database-error metric', async () => {
    const findFirst = jest
      .fn()
      .mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));
    const { metrics, inc } = createMetricsStub();
    const service = new HealthService(createPrismaStub(findFirst), metrics);

    await expect(service.checkDatabase()).resolves.toBe(false);
    expect(inc).toHaveBeenCalledWith({
      operation: 'readiness-check',
    });
  });

  it('returns false when a non-Error value is thrown', async () => {
    const findFirst = jest.fn().mockRejectedValue('connection reset');
    const { metrics } = createMetricsStub();
    const service = new HealthService(createPrismaStub(findFirst), metrics);

    await expect(service.checkDatabase()).resolves.toBe(false);
  });
});
