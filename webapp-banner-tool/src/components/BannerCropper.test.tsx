import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BannerCropper from "./BannerCropper";
import { ApiError } from "../api/client";
const {
  jsonMock,
  fetchMock,
  blobMock,
  getToken,
  showToast,
  bumpRefresh,
  canvasMock,
  destroyMock,
  setDataMock,
  readyCallbacks,
  cropperBehavior,
} = vi.hoisted(() => ({
  jsonMock: vi.fn(),
  fetchMock: vi.fn(),
  blobMock: vi.fn(),
  getToken: vi.fn(),
  showToast: vi.fn(),
  bumpRefresh: vi.fn(),
  canvasMock: vi.fn(),
  destroyMock: vi.fn(),
  setDataMock: vi.fn(),
  readyCallbacks: [] as Array<() => void>,
  cropperBehavior: { autoReady: true },
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ getToken }) }));
vi.mock("./ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../preview/PreviewOverlayContext", () => ({ usePreviewOverlay: () => ({ bumpRefresh }) }));
vi.mock("../api/client", async () => ({
  ...(await vi.importActual("../api/client")),
  apiFetchJson: jsonMock,
  apiFetch: fetchMock,
  apiFetchBlob: blobMock,
}));
vi.mock("cropperjs", () => ({
  default: class {
    constructor(_image: HTMLImageElement, options: { ready: () => void }) {
      readyCallbacks.push(options.ready);
      if (cropperBehavior.autoReady) queueMicrotask(() => options.ready());
    }
    destroy = destroyMock;
    setData = setDataMock;
    getData = () => ({ x: 15, y: 25, width: 500, height: 44 });
    getCroppedCanvas = canvasMock;
    zoom() {}
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  readyCallbacks.length = 0;
  cropperBehavior.autoReady = true;
  URL.createObjectURL = vi.fn(() => "blob:loaded-image");
  URL.revokeObjectURL = vi.fn();
  jsonMock.mockResolvedValue({
    channels: ["General"],
    items: [{ cid: "42", name: "General", pid: null, depth: 0, hasImage: false }],
  });
  fetchMock.mockResolvedValue(new Response());
  blobMock.mockResolvedValue(new Blob());
  canvasMock.mockReturnValue({
    toBlob: (fn: (blob: Blob) => void) => fn(new Blob(["png"], { type: "image/png" })),
  });
});
afterEach(() => vi.unstubAllGlobals());
async function load() {
  render(
    <MemoryRouter>
      <BannerCropper />
    </MemoryRouter>,
  );
  await screen.findByRole("option", { name: "General (#42)" });
  fireEvent.change(screen.getByRole("combobox", { name: "Channel" }), { target: { value: "42" } });
  fireEvent.change(document.getElementById("file-upload")!, {
    target: { files: [new File(["png"], "test.png", { type: "image/png" })] },
  });
  const image = await screen.findByAltText("Preview");
  Object.defineProperties(image, {
    naturalWidth: { value: 1000 },
    naturalHeight: { value: 800 },
    complete: { value: true },
  });
  fireEvent.load(image);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Crop & send image" })).not.toBeDisabled(),
  );
}
describe("banner export workflow", () => {
  it("exports the actual cropped canvas at target dimensions and uploads to the selected CID", async () => {
    await load();
    fireEvent.click(screen.getByRole("button", { name: "Crop & send image" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(canvasMock).toHaveBeenCalledWith({
      width: 500,
      height: 44,
      imageSmoothingQuality: "high",
    });
    expect(fetchMock.mock.calls[0][0]).toContain("/channels/42/image");
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect((body.get("file") as File).type).toBe("image/png");
    expect(await screen.findByAltText("Saved banner for General")).toHaveAttribute(
      "src",
      expect.stringContaining("/by-id/42.png?v="),
    );
  });
  it("offers keyboard-operable movement", async () => {
    await load();
    fireEvent.click(screen.getByRole("button", { name: "Move right" }));
    expect(setDataMock).toHaveBeenCalledWith({ x: 25, y: 25 });
  });
  it("keeps saving disabled until the newest cropper instance is ready", async () => {
    let resize: () => void = () => {};
    cropperBehavior.autoReady = false;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      <MemoryRouter>
        <BannerCropper />
      </MemoryRouter>,
    );
    await screen.findByRole("option", { name: "General (#42)" });
    fireEvent.change(screen.getByRole("combobox", { name: "Channel" }), {
      target: { value: "42" },
    });
    fireEvent.change(document.getElementById("file-upload") as HTMLInputElement, {
      target: { files: [new File(["png"], "test.png", { type: "image/png" })] },
    });
    const image = await screen.findByAltText("Preview");
    Object.defineProperties(image, {
      naturalWidth: { value: 1000 },
      naturalHeight: { value: 800 },
      complete: { value: true },
    });
    fireEvent.load(image);
    expect(readyCallbacks).toHaveLength(1);
    const save = screen.getByRole("button", { name: "Crop & send image" });
    act(() => readyCallbacks[0]());
    expect(save).toBeEnabled();

    const box = document.querySelector(".preview-box") as HTMLDivElement;
    Object.defineProperties(box, {
      clientWidth: { value: 500 },
      clientHeight: { value: 260 },
    });
    act(() => resize());
    await waitFor(() => expect(readyCallbacks).toHaveLength(2));
    expect(save).toBeDisabled();

    act(() => readyCallbacks[0]());
    expect(save).toBeDisabled();
    act(() => readyCallbacks[1]());
    expect(save).toBeEnabled();
  });
  it("rejects an unsupported dropped file with a visible error before reading it", async () => {
    render(
      <MemoryRouter>
        <BannerCropper />
      </MemoryRouter>,
    );
    const input = document.getElementById("file-upload")!;
    fireEvent.change(input, {
      target: { files: [new File(["text"], "readme.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PNG, JPEG or WebP");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("focuses the URL field for local validation and clears its message on correction", async () => {
    render(
      <MemoryRouter>
        <BannerCropper />
      </MemoryRouter>,
    );
    const input = document.getElementById("imageUrl")!;
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter an image URL first.");
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "https://example.test/image.png" } });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Enter an image URL first.")).not.toBeInTheDocument();
  });
  it("associates a server URL validation error after unlocking and retains network failures globally", async () => {
    blobMock.mockRejectedValueOnce(
      new ApiError("Invalid URL", "unknown", 400, undefined, {
        url: ["Choose a public HTTPS image URL."],
      }),
    );
    render(
      <MemoryRouter>
        <BannerCropper />
      </MemoryRouter>,
    );
    const input = document.getElementById("imageUrl")!;
    fireEvent.change(input, { target: { value: "https://example.test/image.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription("Choose a public HTTPS image URL.");
    blobMock.mockRejectedValueOnce(new ApiError("Network connection failed.", "network"));
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network connection failed.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

it("clears a rejected file when a valid URL replaces it and does not refocus it after saving", async () => {
  render(
    <MemoryRouter>
      <BannerCropper />
    </MemoryRouter>,
  );
  await screen.findByRole("option", { name: "General (#42)" });
  fireEvent.change(screen.getByRole("combobox", { name: "Channel" }), { target: { value: "42" } });
  const input = document.getElementById("file-upload")!;
  fireEvent.change(input, {
    target: { files: [new File(["text"], "note.txt", { type: "text/plain" })] },
  });
  expect(input).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(document.getElementById("imageUrl")!, {
    target: { value: "https://example.test/image.png" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  const image = await screen.findByAltText("Preview");
  Object.defineProperties(image, {
    naturalWidth: { value: 1000 },
    naturalHeight: { value: 400 },
    complete: { value: true },
  });
  fireEvent.load(image);
  const save = screen.getByRole("button", { name: "Crop & send image" });
  await waitFor(() => expect(save).not.toBeDisabled());
  save.focus();
  fireEvent.click(save);
  await screen.findByAltText("Saved banner for General");
  await waitFor(() => expect(save).not.toBeDisabled());
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(input).not.toHaveFocus();
  expect(screen.queryByText(/Choose a PNG, JPEG or WebP/)).not.toBeInTheDocument();
});
