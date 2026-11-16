import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import BannerUrlManager from "./BannerUrlManager";

const { apiFetchMock, apiFetchJsonMock, auth, bumpRefresh, showToast } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  apiFetchJsonMock: vi.fn(),
  auth: { getToken: vi.fn() },
  bumpRefresh: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));
// The Studio slots portal into StudioShell; here they render in place.
vi.mock("../design", async () => ({
  ...(await vi.importActual("../design")),
  useToast: () => ({ showToast }),
  StudioInspector: ({ children }: { children: ReactNode }) => (
    <aside aria-label="Inspector">{children}</aside>
  ),
  StudioToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
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
  const view = render(<BannerUrlManager />);

  // The button is disabled while the channels load: click only once it is enabled.
  const setAll = await screen.findByRole("button", { name: "Set for all channels" });
  await waitFor(() => expect(setAll).toBeEnabled());
  fireEvent.click(setAll);
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Set URLs" }),
  );
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

it("shows a real banner URL in monospace and the missing-URL placeholder as plain text", async () => {
  apiFetchJsonMock.mockResolvedValue({
    channels: [
      { ...channels.channels[0], managed: true, bannerGfxUrl: "https://example.test/42.png" },
      { ...channels.channels[0], cid: "43", name: "Lobby" },
    ],
  });
  render(<BannerUrlManager />);

  const urls = await screen.findAllByText("https://example.test/42.png");
  for (const url of urls) expect(url).toHaveClass("banner-urls-url");
  const placeholder = screen.getByText("No banner URL set");
  expect(placeholder).not.toHaveClass("banner-urls-url");
  expect(placeholder.closest(".banner-urls-url")).toBeNull();
});

const twoChannels = {
  channels: [
    {
      cid: "1",
      name: "Alpha",
      managed: true,
      bannerGfxUrl: "https://example.test/1.png",
      pid: null,
      depth: 0,
    },
    { cid: "2", name: "Bravo", managed: false, bannerGfxUrl: null, pid: "1", depth: 1 },
    { cid: "3", name: "Charlie", managed: false, bannerGfxUrl: null, pid: null, depth: 0 },
  ],
};

const rows = () => screen.getAllByRole("row").slice(1);

it("filters by name and by managed state and keeps the count in step", async () => {
  apiFetchJsonMock.mockResolvedValue(twoChannels);
  render(<BannerUrlManager />);

  await screen.findByRole("table", { name: "Channel banner URLs" });
  expect(rows()).toHaveLength(3);
  expect(screen.getByRole("status", { name: "" })).toHaveTextContent("3 of 3 channels · 1 managed");

  fireEvent.click(screen.getByRole("radio", { name: "Not managed" }));
  expect(rows()).toHaveLength(2);
  expect(screen.getByText("2 of 3 channels · 1 managed")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "Managed" }));
  expect(rows()).toHaveLength(1);
  expect(within(rows()[0]).getByText("Alpha")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "All" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter channels" }), {
    target: { value: "brav" },
  });
  expect(rows()).toHaveLength(1);
  expect(within(rows()[0]).getByText("Bravo")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("searchbox", { name: "Filter channels" }), {
    target: { value: "nothing" },
  });
  expect(await screen.findByText("No channels match these filters.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(rows()).toHaveLength(3);
});

it("drives the inspector from the selected row and sets that channel's banner URL", async () => {
  apiFetchJsonMock.mockResolvedValue(twoChannels);
  render(<BannerUrlManager />);

  const inspector = await screen.findByRole("complementary", { name: "Inspector" });
  // The first row is selected by default.
  expect(within(inspector).getByText("#1")).toBeInTheDocument();

  fireEvent.click(within(rows()[1]).getByText("Bravo"));
  expect(rows()[1]).toHaveAttribute("aria-selected", "true");
  expect(within(inspector).getByText("#2")).toBeInTheDocument();
  expect(within(inspector).getByText("Alpha / Bravo")).toBeInTheDocument();
  expect(within(inspector).getByText("No banner URL in TeamSpeak")).toBeInTheDocument();

  fireEvent.click(within(inspector).getByRole("button", { name: "Set banner URL" }));
  await waitFor(() =>
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/2/"),
      expect.objectContaining({ method: "PATCH" }),
    ),
  );
});

it("sets one channel's banner URL from its row and every pending one after confirmation", async () => {
  apiFetchJsonMock.mockResolvedValue(twoChannels);
  render(<BannerUrlManager />);

  await screen.findByRole("table", { name: "Channel banner URLs" });
  fireEvent.click(screen.getByRole("button", { name: "Set banner URL for Charlie" }));
  await waitFor(() =>
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/3/"),
      expect.objectContaining({ method: "PATCH" }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Set for all channels" })).toBeEnabled(),
  );

  apiFetchJsonMock.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith("/apply-banner-urls")
        ? { updated: ["2", "3"], alreadyManaged: ["1"] }
        : twoChannels,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Set for all channels" }));
  const dialog = screen.getByRole("alertdialog");
  expect(within(dialog).getByText("Set managed banner URLs for 2 channel(s)?")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Set URLs" }));
  expect(await screen.findByText("Updated 2 channel(s); 1 already correct.")).toBeInTheDocument();
});
