import { HealthService } from './health.service';
import type { PrismaService } from '../prisma/prisma.service';

function createPrismaStub(findFirst: jest.Mock): PrismaService {
  return {
    channelImage: { findFirst },
  } as unknown as PrismaService;
}

describe('HealthService', () => {
  it('returns true when the database query succeeds', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new HealthService(createPrismaStub(findFirst));

    await expect(service.checkDatabase()).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns false, without throwing, when the database query rejects', async () => {
    const findFirst = jest
      .fn()
      .mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));
    const service = new HealthService(createPrismaStub(findFirst));

    await expect(service.checkDatabase()).resolves.toBe(false);
  });

  it('returns false when a non-Error value is thrown', async () => {
    const findFirst = jest.fn().mockRejectedValue('connection reset');
    const service = new HealthService(createPrismaStub(findFirst));

    await expect(service.checkDatabase()).resolves.toBe(false);
  });
});
