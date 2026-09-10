import { ImageProcessingBusyError, ImageProcessingGate } from "./image-processing-gate";

it("bounds active work and queued inputs, then releases capacity after a failure", async () => {
  const gate = new ImageProcessingGate(1, 1);
  let finish!: () => void;
  const first = gate.run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const queuedWork = jest.fn().mockRejectedValue(new Error("processing failed"));
  const second = gate.run(queuedWork);
  const failure = expect(second).rejects.toThrow("processing failed");
  await expect(gate.run(() => Promise.resolve(3))).rejects.toBeInstanceOf(ImageProcessingBusyError);
  expect(queuedWork).not.toHaveBeenCalled();
  finish();
  await first;
  await failure;
  await expect(gate.run(() => Promise.resolve(4))).resolves.toBe(4);
});
