import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChannelGallery from "./ChannelGallery";
import { ApiError } from "../api/client";
const { fetchMock, jsonMock, getToken, showToast, bumpRefresh } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  jsonMock: vi.fn(),
  getToken: vi.fn(),
  showToast: vi.fn(),
  bumpRefresh: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ getToken }) }));
vi.mock("./ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("./SpacerBaseImageManager", () => ({ default: () => null }));
vi.mock("../preview/PreviewOverlayContext", () => ({ usePreviewOverlay: () => ({ bumpRefresh }) }));
vi.mock("../api/client", async () => ({
  ...(await vi.importActual("../api/client")),
  apiFetch: fetchMock,
  apiFetchJson: jsonMock,
}));
const channels = [
  {
    cid: "10",
    name: "General",
    hasImage: true,
    imageUrl: "/images/by-id/10.png",
    pid: null,
    depth: 0,
  },
  {
    cid: "20",
    name: "General",
    hasImage: true,
    imageUrl: "/images/by-id/20.png",
    pid: "10",
    depth: 1,
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  jsonMock.mockResolvedValue({ channels: ["General", "General"], items: channels });
  fetchMock.mockResolvedValue(new Response());
});
function page() {
  render(
    <MemoryRouter>
      <ChannelGallery />
    </MemoryRouter>,
  );
}
async function cards() {
  await screen.findAllByText("General");
  return Array.from(document.querySelectorAll(".channel-card")) as HTMLElement[];
}
const file = () => new File(["bytes"], "banner.png", { type: "image/png" });
describe("channel image workflows", () => {
  it("uses the selected CID for duplicate names and updates the displayed image URL", async () => {
    page();
    const [, second] = await cards();
    const image = within(second).getByRole("img");
    const before = image.getAttribute("src");
    fireEvent.drop(second, { dataTransfer: { files: [file()] } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/channels/20/image"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(within(second).getByRole("img").getAttribute("src")).not.toBe(before),
    );
  });
  it("keeps B locked when parallel A completes and ignores duplicate drops and deletes", async () => {
    let finishA!: () => void, finishB!: () => void;
    fetchMock.mockImplementation(
      (url: string) =>
        new Promise<void>((resolve) => {
          if (url.includes("/10/")) finishA = resolve;
          else finishB = resolve;
        }),
    );
    page();
    const [a, b] = await cards();
    fireEvent.drop(a, { dataTransfer: { files: [file()] } });
    fireEvent.drop(b, { dataTransfer: { files: [file()] } });
    fireEvent.drop(b, { dataTransfer: { files: [file()] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(within(b).getByRole("button", { name: "Delete image" })).toBeDisabled();
    finishA();
    await waitFor(() =>
      expect(within(a).getByRole("button", { name: "Delete image" })).not.toBeDisabled(),
    );
    expect(within(b).getByRole("button", { name: "Delete image" })).toBeDisabled();
    finishB();
    await waitFor(() =>
      expect(within(b).getByRole("button", { name: "Delete image" })).not.toBeDisabled(),
    );
  });
  it("preserves a failed load as an error with retry, not an empty list", async () => {
    jsonMock.mockRejectedValueOnce(new Error("offline"));
    page();
    expect(await screen.findByRole("alert")).toHaveTextContent("Channels could not be loaded");
    expect(screen.queryByText("No channels found.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await cards();
  });
  it("filters channel names and distinguishes missing images", async () => {
    jsonMock.mockResolvedValue({
      items: [...channels, { cid: "30", name: "Music", hasImage: false, pid: null, depth: 0 }],
      channels: [],
    });
    page();
    await screen.findByText("Music");
    fireEvent.change(screen.getByRole("combobox", { name: "Image status" }), {
      target: { value: "missing" },
    });
    expect(screen.queryAllByText("General")).toHaveLength(0);
    expect(screen.getByText("Music")).toBeInTheDocument();
  });
  it("does not delete an image when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    page();
    const [card] = await cards();
    fireEvent.click(within(card).getByRole("button", { name: "Delete image" }));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("places a rejected upload on the matching CID input and focuses it after upload ends", async () => {
    fetchMock.mockRejectedValueOnce(
      new ApiError("Image exceeds the upload limit.", "unknown", 413),
    );
    page();
    const [first, second] = await cards();
    fireEvent.drop(second, { dataTransfer: { files: [file()] } });
    const input = second.querySelector("input[type=file]")!;
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Image exceeds the upload limit.");
    expect(first.querySelector("input[type=file]")).not.toHaveAttribute("aria-invalid");
  });
});

it("reloads metadata after deleting a spacer image and displays its base fallback", async () => {
  jsonMock
    .mockResolvedValueOnce({
      items: [{ ...channels[0], name: "Spacer", isSpacer: true }],
      channels: [],
    })
    .mockResolvedValue({
      items: [
        { ...channels[0], name: "Spacer", isSpacer: true, hasImage: false, hasFallback: true },
      ],
      channels: [],
    });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  page();
  fireEvent.click(await screen.findByRole("button", { name: "Delete image" }));
  await screen.findByText(/Spacer base image/);
  expect(screen.getByRole("img", { name: "Spacer" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete image" })).toBeDisabled();
  vi.restoreAllMocks();
});

it("replaces an input validation error when another file is dropped on the card", async () => {
  page();
  const [card] = await cards();
  const input = card.querySelector("input[type=file]")!;
  fireEvent.change(input, {
    target: { files: [new File(["text"], "note.txt", { type: "text/plain" })] },
  });
  expect(input).toHaveAttribute("aria-invalid", "true");
  const oversized = new File(["png"], "large.png", { type: "image/png" });
  Object.defineProperty(oversized, "size", { value: 50 * 1024 * 1024 });
  fireEvent.drop(card, { dataTransfer: { files: [oversized] } });
  expect(input).toHaveAccessibleDescription("Choose an image smaller than 10 MB.");
  expect(within(card).queryByText(/Choose a PNG, JPEG or WebP/)).not.toBeInTheDocument();
  const remove = within(card).getByRole("button", { name: "Delete image" });
  remove.focus();
  fireEvent.drop(card, { dataTransfer: { files: [file()] } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(remove).not.toBeDisabled());
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(input).not.toHaveFocus();
  expect(within(card).queryByRole("alert")).not.toBeInTheDocument();
});
