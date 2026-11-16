import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BannerImage } from "./BannerImage";

// T-142-F4, F-142-28: a banner that fails to load shows the quiet empty tile,
// never the browser's broken-image icon (layer panel thumbnails, Before strip).
describe("BannerImage", () => {
  const fallback = <span data-testid="empty">No banner yet</span>;

  it("shows the banner while it loads", () => {
    render(<BannerImage src="https://x.test/by-id/20.png" alt="Banner" fallback={fallback} />);
    expect(screen.getByAltText("Banner")).toHaveAttribute("src", "https://x.test/by-id/20.png");
    expect(screen.queryByTestId("empty")).toBeNull();
  });

  it("replaces a banner that fails to load (404) with the fallback", () => {
    render(<BannerImage src="https://x.test/by-id/20.png" alt="Banner" fallback={fallback} />);
    fireEvent.error(screen.getByAltText("Banner"));
    expect(screen.queryByAltText("Banner")).toBeNull();
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });

  it("shows the fallback without a source and tries a new source again", () => {
    const { rerender } = render(<BannerImage src={null} alt="Banner" fallback={fallback} />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
    rerender(<BannerImage src="https://x.test/a.png" alt="Banner" fallback={fallback} />);
    fireEvent.error(screen.getByAltText("Banner"));
    rerender(<BannerImage src="https://x.test/b.png" alt="Banner" fallback={fallback} />);
    expect(screen.getByAltText("Banner")).toHaveAttribute("src", "https://x.test/b.png");
  });
});
