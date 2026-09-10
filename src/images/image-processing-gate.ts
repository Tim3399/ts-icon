export class ImageProcessingBusyError extends Error {
  constructor() {
    super("Image processing is busy; retry shortly");
  }
}

// Two active jobs and two queued inputs bound both decoded images and uploads
// waiting in memory. Additional requests receive an explicit retryable error.
export class ImageProcessingGate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly concurrency = 2,
    private readonly queueLimit = 2,
  ) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.queueLimit) throw new ImageProcessingBusyError();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

export const wallpaperProcessingGate = new ImageProcessingGate();
