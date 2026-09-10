import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BannerUrlManager from "./BannerUrlManager";

const { apiFetchMock, apiFetchJsonMock, auth, bumpRefresh, showToast } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  apiFetchJsonMock: vi.fn(),
  auth: { getToken: vi.fn() },
  bumpRefresh: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("./ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../preview/PreviewOverlayContext", () => ({
  usePreviewOverlay: () => ({ bumpRefresh }),
}));
vi.mock("./SpacerBaseImageManager", () => ({ default: () => null }));
vi.mock("../api/client", async () => ({
  ...(await vi.importActual("../api/client")),
  apiFetch: apiFetchMock,
  apiFetchJson: apiFetchJsonMock,
}));

const channels = {
  channels: [
    {
      cid: "42",
      name: "General",
      managed: false,
      bannerGfxUrl: null,
      pid: null,
      depth: 0,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.getToken = vi.fn();
  apiFetchJsonMock.mockResolvedValue(channels);
  apiFetchMock.mockResolvedValue(new Response());
});

afterEach(() => vi.restoreAllMocks());

it("does not continue an obsolete banner update after the auth callback changes", async () => {
  let finishUpdate!: () => void;
  apiFetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finishUpdate = () => resolve(new Response());
      }),
  );
  const view = render(<BannerUrlManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Set banner URL" }));
  const signal = apiFetchMock.mock.calls[0][1].signal as AbortSignal;
  auth.getToken = vi.fn();
  view.rerender(<BannerUrlManager />);
  expect(signal.aborted).toBe(true);
  await act(async () => finishUpdate());

  expect(apiFetchJsonMock).toHaveBeenCalledTimes(2);
  expect(showToast).not.toHaveBeenCalled();
  expect(bumpRefresh).not.toHaveBeenCalled();
});

it("aborts a bulk update and skips its follow-up work after unmount", async () => {
  let finishUpdate!: () => void;
  apiFetchJsonMock.mockImplementation((url: string) => {
    if (!url.endsWith("/apply-banner-urls")) return Promise.resolve(channels);
    return new Promise((resolve) => {
      finishUpdate = () => resolve({ updated: ["42"], alreadyManaged: [] });
    });
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const view = render(<BannerUrlManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Set for all channels" }));
  const signal = apiFetchJsonMock.mock.calls[1][1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finishUpdate());

  expect(apiFetchJsonMock).toHaveBeenCalledTimes(2);
  expect(showToast).not.toHaveBeenCalled();
  expect(bumpRefresh).not.toHaveBeenCalled();
});

it("aborts the status reload and skips completion effects after unmount", async () => {
  let finishReload!: () => void;
  apiFetchJsonMock.mockResolvedValueOnce(channels).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishReload = () => resolve(channels);
      }),
  );
  const view = render(<BannerUrlManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Set banner URL" }));
  await waitFor(() => expect(apiFetchJsonMock).toHaveBeenCalledTimes(2));
  const signal = apiFetchJsonMock.mock.calls[1][1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finishReload());

  expect(showToast).not.toHaveBeenCalled();
  expect(bumpRefresh).not.toHaveBeenCalled();
});
