import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChannelWallpaperGenerator from "./ChannelWallpaperGenerator";
import { ApiError } from "../api/client";
const { jsonMock, getToken, showToast, setOverlay, bumpRefresh } = vi.hoisted(() => ({
  jsonMock: vi.fn(),
  getToken: vi.fn(),
  showToast: vi.fn(),
  setOverlay: vi.fn(),
  bumpRefresh: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ getToken }) }));
vi.mock("./ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../preview/PreviewOverlayContext", () => ({
  usePreviewOverlay: () => ({ setOverlay, bumpRefresh, refreshKey: 0 }),
}));
vi.mock("../api/client", async () => ({
  ...(await vi.importActual("../api/client")),
  apiFetchJson: jsonMock,
}));
vi.mock("./ChannelTreePreview", () => ({ default: () => <div>Parent selector</div> }));
const row = (name: string) => ({
  depth: 0,
  isSpacer: false,
  imageDataUrl: `data:image/png;base64,${name}`,
});
const run = {
  runId: "run-1",
  requestId: "request-1",
  status: "completed",
  createdChannels: [{ cid: "10", name: "Wall 1", kind: "art", depth: 0 }],
  rowCount: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  jsonMock.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith("/runs")
        ? { runs: [] }
        : url.endsWith("/preview")
          ? { rows: [row("AAA")] }
          : run,
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function page() {
  render(
    <MemoryRouter>
      <ChannelWallpaperGenerator />
    </MemoryRouter>,
  );
}
async function source() {
  fireEvent.change(document.getElementById("wallpaper-source-url")!, {
    target: { value: "https://example.test/image.png" },
  });
  await act(() => vi.advanceTimersByTimeAsync(600));
}
describe("wallpaper operation recovery", () => {
  it("ignores an old preview response after a newer request completed", async () => {
    const responses: ((value: unknown) => void)[] = [];
    jsonMock.mockImplementation((url: string) =>
      url.endsWith("/preview")
        ? new Promise((resolve) => responses.push(resolve))
        : Promise.resolve({ runs: [] }),
    );
    page();
    await source();
    fireEvent.change(document.getElementById("wallpaper-source-url")!, {
      target: { value: "https://example.test/new.png" },
    });
    await act(() => vi.advanceTimersByTimeAsync(600));
    await act(async () => responses[1]({ rows: [row("NEW")] }));
    await act(async () => responses[0]({ rows: [row("OLD")] }));
    expect(screen.getByAltText("channel row")).toHaveAttribute(
      "src",
      expect.stringContaining("NEW"),
    );
  });
  it("retains failed undo channels and supports retry using only the run ID", async () => {
    jsonMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/runs")
          ? { runs: [run] }
          : {
              deleted: [],
              failed: [{ cid: "10", error: "Channel occupied" }],
              run: { ...run, status: "undo-partial" },
            },
      ),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    page();
    fireEvent.click(await screen.findByRole("button", { name: "Undo this generation" }));
    expect(await screen.findByRole("button", { name: "Retry undo" })).toBeInTheDocument();
    expect(screen.getByText("Wall 1 (#10)")).toBeInTheDocument();
    const call = jsonMock.mock.calls.find(([url]) => url.endsWith("/undo"));
    expect(JSON.parse(call![1].body)).toEqual({ runId: "run-1" });
  });
  it("preserves earlier results when a new generation fails and reuses its request ID on retry", async () => {
    jsonMock.mockImplementation((url: string) =>
      url.endsWith("/runs")
        ? Promise.resolve({ runs: [run] })
        : url.endsWith("/preview")
          ? Promise.resolve({ rows: [row("AAA")] })
          : Promise.reject(new Error("network")),
    );
    page();
    await source();
    fireEvent.click(screen.getByRole("button", { name: "Generate channels" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate channels" })).not.toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Undo this generation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate channels" }));
    await waitFor(() =>
      expect(
        jsonMock.mock.calls.filter(([url]) => url.endsWith("/channel-wallpaper")),
      ).toHaveLength(2),
    );
    const calls = jsonMock.mock.calls.filter(([url]) => url.endsWith("/channel-wallpaper"));
    expect(calls[0][1].body.get("requestId")).toBe(calls[1][1].body.get("requestId"));
  });
  it("requires a successful preview of current valid inputs before generation", async () => {
    page();
    expect(screen.getByRole("button", { name: "Generate channels" })).toBeDisabled();
    await source();
    expect(screen.getByRole("button", { name: "Generate channels" })).not.toBeDisabled();
    fireEvent.change(document.getElementById("wallpaper-name-prefix")!, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Generate channels" })).toBeDisabled();
  });
  it("links local validation to its field and focuses the first error on review", async () => {
    page();
    await source();
    const prefix = document.getElementById("wallpaper-name-prefix")!;
    fireEvent.change(prefix, { target: { value: "" } });
    expect(prefix).toHaveAttribute("aria-invalid", "true");
    expect(prefix).toHaveAccessibleDescription("Enter a channel name prefix.");
    fireEvent.click(screen.getByRole("button", { name: "Review highlighted fields" }));
    await waitFor(() => expect(prefix).toHaveFocus());
    fireEvent.change(prefix, { target: { value: "Fixed" } });
    expect(prefix).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Enter a channel name prefix.")).not.toBeInTheDocument();
  });
  it("shows structured preview errors beside fields, opens advanced options, and focuses in form order", async () => {
    jsonMock.mockImplementation((url: string) =>
      url.endsWith("/preview")
        ? Promise.reject(
            new ApiError("Invalid inputs", "unknown", 400, undefined, {
              backgroundColor: ["Choose a valid color."],
              sourceImageUrl: ["This URL must use HTTPS."],
            }),
          )
        : Promise.resolve({ runs: [] }),
    );
    page();
    await source();
    const url = document.getElementById("wallpaper-source-url")!;
    const background = document.getElementById("wallpaper-background")!;
    expect(background).toHaveAttribute("aria-invalid", "true");
    expect(background).toHaveAccessibleDescription("Choose a valid color.");
    expect(url).toHaveAccessibleDescription("This URL must use HTTPS.");
    await waitFor(() => expect(url).toHaveFocus());
    expect(screen.queryByText("Invalid inputs")).not.toBeInTheDocument();
    jsonMock.mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint.endsWith("/preview") ? { rows: [row("OK")] } : { runs: [] }),
    );
    fireEvent.change(url, { target: { value: "https://example.test/corrected.png" } });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(url).not.toHaveAttribute("aria-invalid");
    expect(background).not.toHaveAttribute("aria-invalid");
  });
  it("keeps server faults as a general error instead of blaming a field", async () => {
    jsonMock.mockImplementation((url: string) =>
      url.endsWith("/preview")
        ? Promise.reject(
            new ApiError("The server is unavailable.", "server-error", 503, undefined, {
              namePrefix: ["Misleading field"],
            }),
          )
        : Promise.resolve({ runs: [] }),
    );
    page();
    await source();
    expect(screen.getByRole("alert")).toHaveTextContent("The server is unavailable.");
    expect(document.getElementById("wallpaper-name-prefix")).not.toHaveAttribute("aria-invalid");
  });
  it("focuses a generation field error after the action unlocks", async () => {
    jsonMock.mockImplementation((url: string) =>
      url.endsWith("/runs")
        ? Promise.resolve({ runs: [] })
        : url.endsWith("/preview")
          ? Promise.resolve({ rows: [row("OK")] })
          : Promise.reject(
              new ApiError("Invalid inputs", "unknown", 400, undefined, {
                namePrefix: ["Choose a different prefix."],
              }),
            ),
    );
    page();
    await source();
    fireEvent.click(screen.getByRole("button", { name: "Generate channels" }));
    const prefix = document.getElementById("wallpaper-name-prefix")!;
    await waitFor(() => expect(prefix).toHaveFocus());
    expect(prefix).toHaveAccessibleDescription("Choose a different prefix.");
    expect(prefix).not.toBeDisabled();
    expect(screen.queryByText("Invalid inputs")).not.toBeInTheDocument();
  });
  it("retains validation messages for unknown fields including inherited object property names", async () => {
    jsonMock.mockImplementation((url: string) =>
      url.endsWith("/preview")
        ? Promise.reject(
            new ApiError("Remove unsupported fields.", "unknown", 400, undefined, {
              constructor: ["This field is not allowed."],
            }),
          )
        : Promise.resolve({ runs: [] }),
    );
    page();
    await source();
    expect(screen.getByRole("alert")).toHaveTextContent("Remove unsupported fields.");
    expect(
      screen.queryByRole("button", { name: "Review highlighted fields" }),
    ).not.toBeInTheDocument();
  });
});

it("allows safe cleanup of an incomplete operation with zero recorded channels", async () => {
  jsonMock.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith("/runs")
        ? { runs: [{ ...run, status: "partial-failure", createdChannels: [], rowCount: 0 }] }
        : {
            deleted: [],
            failed: [],
            run: { ...run, status: "undone", createdChannels: [], rowCount: 0 },
          },
    ),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  page();
  fireEvent.click(await screen.findByRole("button", { name: "Discard operation" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Discard operation" })).not.toBeInTheDocument(),
  );
  expect(jsonMock.mock.calls.find(([url]) => url.endsWith("/undo"))?.[1].body).toBe(
    JSON.stringify({ runId: "run-1" }),
  );
});

it("clears a rejected file after switching to an image URL", async () => {
  page();
  const input = document.getElementById("wallpaper-file-upload")!;
  fireEvent.change(input, {
    target: { files: [new File(["text"], "note.txt", { type: "text/plain" })] },
  });
  expect(input).toHaveAttribute("aria-invalid", "true");
  await source();
  const generate = screen.getByRole("button", { name: "Generate channels" });
  expect(generate).not.toBeDisabled();
  generate.focus();
  fireEvent.click(generate);
  await screen.findByRole("button", { name: "Undo this generation" });
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(input).not.toHaveFocus();
  expect(screen.queryByText(/Choose a PNG, JPEG or WebP/)).not.toBeInTheDocument();
});
