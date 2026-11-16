import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BannerCropper from "./BannerCropper";
import { StudioShell } from "../design";
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
  resetMock,
  zoomMock,
  zoomCallbacks,
  readyCallbacks,
  cropCallbacks,
  cropperBehavior,
  imageState,
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
  resetMock: vi.fn(),
  zoomMock: vi.fn(),
  zoomCallbacks: [] as Array<(event: { detail: { ratio: number } }) => void>,
  readyCallbacks: [] as Array<() => void>,
  cropCallbacks: [] as Array<() => void>,
  cropperBehavior: { autoReady: true },
  // The cropper's image data: the zoom readout reads it (F-142-29).
  imageState: { width: 640, naturalWidth: 1000, naturalHeight: 800 },
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
    constructor(
      _image: HTMLImageElement,
      options: {
        ready: () => void;
        crop: () => void;
        zoom: (event: { detail: { ratio: number } }) => void;
      },
    ) {
      readyCallbacks.push(options.ready);
      cropCallbacks.push(options.crop);
      zoomCallbacks.push(options.zoom);
      if (cropperBehavior.autoReady) queueMicrotask(() => options.ready());
    }
    destroy = destroyMock;
    setData = setDataMock;
    getData = () => ({ x: 15, y: 25, width: 500, height: 44 });
    getCroppedCanvas = canvasMock;
    getCropBoxData = () => ({ left: 10, top: 20, width: 400, height: 35 });
    getImageData = () => ({ ...imageState });
    reset = resetMock;
    zoom = zoomMock;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  readyCallbacks.length = 0;
  cropCallbacks.length = 0;
  zoomCallbacks.length = 0;
  cropperBehavior.autoReady = true;
  imageState.width = 640;
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
      <StudioShell modes={null} account={null}>
        <BannerCropper />
      </StudioShell>
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
  it("sets the crop from the X and Y fields, in source pixels", async () => {
    await load();
    fireEvent.change(screen.getByRole("textbox", { name: "X" }), { target: { value: "40" } });
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 40, y: 25, width: 500, height: 44 });
    fireEvent.change(screen.getByRole("textbox", { name: "Y" }), { target: { value: "60" } });
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 15, y: 60, width: 500, height: 44 });
    // The arrow keys nudge by 1 (and Shift by 10): keyboard-operable movement.
    fireEvent.keyDown(screen.getByRole("textbox", { name: "X" }), { key: "ArrowUp" });
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 16, y: 25, width: 500, height: 44 });
  });
  it("keeps W and H at 500 : 44 (R6)", async () => {
    await load();
    fireEvent.change(screen.getByLabelText(/Width/), { target: { value: "600" } });
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 15, y: 25, width: 600, height: 53 });
    fireEvent.change(screen.getByLabelText(/Height/), { target: { value: "66" } });
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 15, y: 25, width: 750, height: 66 });
    fireEvent.change(screen.getByLabelText(/Width/), { target: { value: "800" } });
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 15, y: 25, width: 800, height: 70 });
  });
  // F-142-34: the crop numbers are clamped; an invalid crop is never applied or saved.
  it("does not apply W = 1, shows it invalid, blocks Save and clamps it to 500 on leaving", async () => {
    await load();
    const width = screen.getByLabelText(/Width/);
    const calls = setDataMock.mock.calls.length;
    fireEvent.change(width, { target: { value: "1" } });
    expect(setDataMock.mock.calls.length).toBe(calls);
    expect(width).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Crop & send image" })).toBeDisabled();
    fireEvent.blur(width);
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 15, y: 25, width: 500, height: 44 });
  });
  it("clamps W above the image width to the image width", async () => {
    await load();
    const width = screen.getByLabelText(/Width/);
    fireEvent.change(width, { target: { value: "2000" } });
    expect(width).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(width);
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 0, y: 25, width: 1000, height: 88 });
  });
  it("clamps a negative X to 0", async () => {
    await load();
    const x = screen.getByRole("textbox", { name: "X" });
    fireEvent.change(x, { target: { value: "-5" } });
    expect(x).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(x);
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 0, y: 25, width: 500, height: 44 });
    expect(x).not.toHaveAttribute("aria-invalid");
  });
  it("shows the crop numbers of the live crop", async () => {
    await load();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("15"));
    expect(screen.getByLabelText(/Width/)).toHaveValue("500");
    expect(screen.getByLabelText(/Height/)).toHaveValue("44");
  });
  it("fits and zooms the cropper and shows the real zoom", async () => {
    await load();
    await waitFor(() => expect(screen.getByLabelText("Zoom level")).toHaveTextContent("64 %"));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(zoomMock).toHaveBeenLastCalledWith(0.1);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoomMock).toHaveBeenLastCalledWith(-0.1);
    // The readout is the real zoom of the image after the change, not the request (F-142-29).
    imageState.width = 1500;
    act(() => zoomCallbacks.at(-1)!({ detail: { ratio: 9 } }));
    await waitFor(() => expect(screen.getByLabelText("Zoom level")).toHaveTextContent("150 %"));
    // At the minimum (the frame, 400 px of 1000) zoom-out is disabled.
    imageState.width = 400;
    act(() => zoomCallbacks.at(-1)!({ detail: { ratio: 0.1 } }));
    await waitFor(() => expect(screen.getByLabelText("Zoom level")).toHaveTextContent("40 %"));
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Fit to screen" }));
    expect(resetMock).toHaveBeenCalled();
    expect(setDataMock).toHaveBeenLastCalledWith({ x: 15, y: 25, width: 500, height: 44 });
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
        <StudioShell modes={null} account={null}>
          <BannerCropper />
        </StudioShell>
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
        <StudioShell modes={null} account={null}>
          <BannerCropper />
        </StudioShell>
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
        <StudioShell modes={null} account={null}>
          <BannerCropper />
        </StudioShell>
      </MemoryRouter>,
    );
    const input = document.getElementById("imageUrl")!;
    fireEvent.click(screen.getByRole("button", { name: "Load URL" }));
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
        <StudioShell modes={null} account={null}>
          <BannerCropper />
        </StudioShell>
      </MemoryRouter>,
    );
    const input = document.getElementById("imageUrl")!;
    fireEvent.change(input, { target: { value: "https://example.test/image.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Load URL" }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription("Choose a public HTTPS image URL.");
    blobMock.mockRejectedValueOnce(new ApiError("Network connection failed.", "network"));
    fireEvent.click(screen.getByRole("button", { name: "Load URL" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network connection failed.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

it("clears a rejected file when a valid URL replaces it and does not refocus it after saving", async () => {
  render(
    <MemoryRouter>
      <StudioShell modes={null} account={null}>
        <BannerCropper />
      </StudioShell>
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
  fireEvent.click(screen.getByRole("button", { name: "Load URL" }));
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
    // The 1:1 saved strip shows the same export.
    expect(screen.getByText("Saved image · 500 × 44 · 1:1")).toBeInTheDocument();
    expect(screen.getByAltText(/^Saved image for General/)).toHaveAttribute("src", preview);
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
        <StudioShell modes={null} account={null}>
          <BannerCropper />
        </StudioShell>
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
    fireEvent.drop(container.querySelector(".studio-editor")!, {
      dataTransfer: { types: ["Files"], files: [file] },
    });
    expect(await screen.findByAltText("Preview")).toBeInTheDocument();
  });
});

describe("Studio editor (T-142-F3 items 4, 6 and the deep link)", () => {
  function renderAt(entry = "/") {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <StudioShell modes={null} account={null}>
          <BannerCropper />
        </StudioShell>
      </MemoryRouter>,
    );
  }

  it("selects a channel by clicking its layer row (the same state as the select)", async () => {
    renderAt();
    const row = await screen.findByRole("button", { name: /General/ });
    expect(row).not.toHaveAttribute("aria-current");
    fireEvent.click(row);
    expect(screen.getByRole("combobox", { name: "Channel" })).toHaveValue("42");
    expect(row).toHaveAttribute("aria-current", "true");
  });

  it("preselects the channel of /?channel=<cid>", async () => {
    renderAt("/?channel=42");
    await screen.findByRole("option", { name: "General (#42)" });
    expect(screen.getByRole("combobox", { name: "Channel" })).toHaveValue("42");
    expect(screen.getByRole("button", { name: /General/ })).toHaveAttribute("aria-current", "true");
  });

  it("shows the quiet empty tile as Before when the channel has no banner", async () => {
    canvasMock.mockReturnValue(fakeCanvas("after"));
    await load();
    expect(screen.getByText("No banner yet")).toBeInTheDocument();
    expect(await screen.findByAltText("New banner of General")).toHaveAttribute(
      "src",
      fakeCanvas("after").toDataURL(),
    );
    expect(screen.getByText("No current banner")).toBeInTheDocument();
  });

  it("shows the current banner as Before when the channel has one", async () => {
    jsonMock.mockResolvedValue({
      channels: ["General"],
      items: [{ cid: "42", name: "General", pid: null, depth: 0, hasImage: true }],
    });
    canvasMock.mockReturnValue(fakeCanvas("after"));
    await load();
    expect(screen.getByAltText("Current banner of General")).toHaveAttribute(
      "src",
      expect.stringContaining("/by-id/42.png"),
    );
    expect(await screen.findByAltText("New banner of General")).toBeInTheDocument();
    expect(screen.getByText("Current banner of General")).toBeInTheDocument();
  });
});

describe("edge cases (T-142-F4)", () => {
  const marker = () => document.querySelector(".ts-preview-selected .channel-tree-marker");

  it("puts New on the channel that has the unsaved crop, also after save and a switch (F-142-30)", async () => {
    jsonMock.mockResolvedValue({
      channels: ["General", "Music"],
      items: [
        { cid: "42", name: "General", pid: null, depth: 0, hasImage: false },
        { cid: "43", name: "Music", pid: null, depth: 0, hasImage: false },
      ],
    });
    canvasMock.mockReturnValue(fakeCanvas("crop"));
    await load();
    await waitFor(() => expect(marker()).toHaveTextContent("New"));
    fireEvent.click(screen.getByRole("button", { name: "Crop & send image" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(marker()).toBeNull());
    // The same crop on another channel is not saved there: New again.
    fireEvent.change(screen.getByRole("combobox", { name: "Channel" }), {
      target: { value: "43" },
    });
    await waitFor(() => expect(marker()).toHaveTextContent("New"));
    expect(document.querySelector(".ts-preview-selected")).toHaveTextContent("Music");
  });

  it("keeps the spacer base image of a spacer without its own image (F-142-31)", async () => {
    jsonMock.mockResolvedValue({
      channels: ["[spacer]Base"],
      items: [
        {
          cid: "42",
          name: "[spacer]Base",
          pid: null,
          depth: 0,
          hasImage: false,
          hasFallback: true,
          isSpacer: true,
        },
      ],
    });
    renderEditorAt42();
    await screen.findByRole("option", { name: "[spacer]Base (#42)" });
    expect(screen.getByAltText("Current banner of [spacer]Base")).toHaveAttribute(
      "src",
      expect.stringContaining("/by-id/42.png"),
    );
    expect(screen.getByText("Spacer base image")).toBeInTheDocument();
    expect(screen.getByText("The spacer base image")).toBeInTheDocument();
    // The layer panel and the preview row show it too.
    expect(document.querySelector("img.layer-thumb")).toHaveAttribute(
      "src",
      expect.stringContaining("/by-id/42.png"),
    );
    expect(document.querySelector(".ts-preview-selected img")).toHaveAttribute(
      "src",
      expect.stringContaining("/by-id/42.png"),
    );
  });

  it("never sends a fully transparent banner (F-142-34)", async () => {
    const blank = {
      ...fakeCanvas("blank"),
      width: 500,
      height: 44,
      getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(500 * 44 * 4) }) }),
    };
    canvasMock.mockReturnValue(blank);
    await load();
    fireEvent.click(screen.getByRole("button", { name: "Crop & send image" }));
    expect(await screen.findByText(/The frame is empty/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  function renderEditorAt42() {
    return render(
      <MemoryRouter initialEntries={["/?channel=42"]}>
        <StudioShell modes={null} account={null}>
          <BannerCropper />
        </StudioShell>
      </MemoryRouter>,
    );
  }
});
