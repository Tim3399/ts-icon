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
  cropCallbacks,
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
  cropCallbacks: [] as Array<() => void>,
  cropperBehavior: { autoReady: true },
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ getToken }) }));
vi.mock("../design", async () => ({
  ...(await vi.importActual("../design")),
  useToast: () => ({ showToast }),
}));
vi.mock("../preview/PreviewOverlayContext", () => ({ usePreviewOverlay: () => ({ bumpRefresh }) }));
vi.mock("../api/client", async () => ({
  ...(await vi.importActual("../api/client")),
  apiFetchJson: jsonMock,
  apiFetch: fetchMock,
  apiFetchBlob: blobMock,
}));
vi.mock("cropperjs", () => ({
  default: class {
    constructor(_image: HTMLImageElement, options: { ready: () => void; crop: () => void }) {
      readyCallbacks.push(options.ready);
      cropCallbacks.push(options.crop);
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
  cropCallbacks.length = 0;
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

/** A canvas stand-in whose PNG encodings both carry `bytes`. */
function fakeCanvas(bytes: string) {
  return {
    toDataURL: () => `data:image/png;base64,${btoa(bytes)}`,
    toBlob: (fn: (blob: Blob) => void) => fn(new Blob([bytes], { type: "image/png" })),
  };
}

const croppedBanner = () => screen.findByAltText("Cropped banner for General");

describe("TeamSpeak preview (T-142-F1 items 14, 15, 17)", () => {
  it("shows the crop in a region named Preview in TeamSpeak, with alt text naming the channel", async () => {
    canvasMock.mockReturnValue(fakeCanvas("first"));
    await load();
    expect(screen.getByRole("figure", { name: "Preview in TeamSpeak" })).toContainElement(
      await croppedBanner(),
    );
  });

  it("re-renders the preview when the crop changes", async () => {
    canvasMock.mockReturnValue(fakeCanvas("first"));
    await load();
    await waitFor(async () =>
      expect((await croppedBanner()).getAttribute("src")).toBe(fakeCanvas("first").toDataURL()),
    );
    canvasMock.mockReturnValue(fakeCanvas("moved"));
    act(() => cropCallbacks.at(-1)!());
    await waitFor(async () =>
      expect((await croppedBanner()).getAttribute("src")).toBe(fakeCanvas("moved").toDataURL()),
    );
  });

  it("previews exactly the bytes that are uploaded, from one export of the same crop", async () => {
    canvasMock.mockReturnValue(fakeCanvas("exact banner pixels"));
    await load();
    const preview = (await croppedBanner()).getAttribute("src")!;
    fireEvent.click(screen.getByRole("button", { name: "Crop & send image" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const uploaded = (fetchMock.mock.calls[0][1].body as FormData).get("file") as File;
    const previewBytes = atob(preview.split(",")[1]);
    expect(await uploaded.text()).toBe(previewBytes);
    // Both came from exportBanner: the same cropped-canvas request every time.
    for (const call of canvasMock.mock.calls)
      expect(call[0]).toEqual({ width: 500, height: 44, imageSmoothingQuality: "high" });
  });
});

describe("image sources (T-142-F1 item 13)", () => {
  function renderEditor() {
    return render(
      <MemoryRouter>
        <BannerCropper />
      </MemoryRouter>,
    );
  }

  function pasteEvent(data: { files?: File[]; text?: string }) {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: data.files ?? [],
        items: [],
        getData: (type: string) => (type === "text/plain" ? (data.text ?? "") : ""),
      },
    });
    return event;
  }

  it("loads a pasted image file into the cropper", async () => {
    renderEditor();
    const file = new File(["png"], "clip.png", { type: "image/png" });
    act(() => {
      document.body.dispatchEvent(pasteEvent({ files: [file] }));
    });
    expect(await screen.findByAltText("Preview")).toHaveAttribute(
      "src",
      expect.stringContaining("data:image/png"),
    );
  });

  it("loads a pasted image URL through the server", async () => {
    renderEditor();
    act(() => {
      document.body.dispatchEvent(pasteEvent({ text: "https://example.test/pasted.png" }));
    });
    await waitFor(() => expect(blobMock).toHaveBeenCalled());
    expect(blobMock.mock.calls[0][0]).toContain(
      encodeURIComponent("https://example.test/pasted.png"),
    );
    expect(document.getElementById("imageUrl")).toHaveValue("https://example.test/pasted.png");
  });

  it("leaves text pasted into a text field to the field", async () => {
    renderEditor();
    const input = document.getElementById("imageUrl")!;
    act(() => {
      input.dispatchEvent(pasteEvent({ text: "https://example.test/typed.png" }));
    });
    expect(blobMock).not.toHaveBeenCalled();
  });

  it("rejects a pasted non-image without reading it", async () => {
    renderEditor();
    const event = pasteEvent({ files: [new File(["x"], "a.gif", { type: "image/gif" })] });
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PNG, JPEG or WebP");
    expect(screen.queryByAltText("Preview")).toBeNull();
  });

  it("loads an image dropped anywhere on the editor", async () => {
    const { container } = renderEditor();
    const file = new File(["png"], "dropped.png", { type: "image/png" });
    fireEvent.drop(container.querySelector(".banner-editor")!, {
      dataTransfer: { types: ["Files"], files: [file] },
    });
    expect(await screen.findByAltText("Preview")).toBeInTheDocument();
  });
});
