import { sanitizeArgs } from "./prisma.service";

describe("database log redaction", () => {
  it("never expands binary views in nested Prisma write arguments", () => {
    const args = {
      create: { image: new Uint8Array([1, 2, 3]) },
      update: { image: Buffer.from([4, 5]) },
    };
    expect(sanitizeArgs(args)).toEqual({
      create: { image: "<Binary (3 bytes)>" },
      update: { image: "<Binary (2 bytes)>" },
    });
  });
});
