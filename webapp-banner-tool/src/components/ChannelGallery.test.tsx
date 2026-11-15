import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
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
// The Studio slots portal into StudioShell; here they render in place.
vi.mock("../design", async () => ({
  ...(await vi.importActual("../design")),
  useToast: () => ({ showToast }),
  StudioInspector: ({ children }: { children: ReactNode }) => (
    <aside aria-label="Inspector">{children}</aside>
  ),
  StudioToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
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
    size: 18_431,
    updatedAt: "2026-11-03T09:15:00Z",
  },
  {
    cid: "20",
    name: "General",
    hasImage: true,
    imageUrl: "/images/by-id/20.png",
    pid: "10",
    depth: 1,
    size: 2048,
    updatedAt: "2026-11-04T10:00:00Z",
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
async function rows() {
  await screen.findAllByText("General");
  return Array.from(document.querySelectorAll(".channel-row")) as HTMLElement[];
}
const inspector = () => screen.getByRole("complementary", { name: "Inspector" });
/** Selects a row by a click on its channel cell, as a user would. */
function select(row: HTMLElement) {
  fireEvent.click(row.querySelector(".channel-name")!);
}
const file = () => new File(["bytes"], "banner.png", { type: "image/png" });
describe("channel image workflows", () => {
  it("uses the selected CID for duplicate names and updates the displayed image URL", async () => {
    page();
    const [, second] = await rows();
    const image = within(second).getByRole("img");
    const before = image.getAttribute("src");
    fireEvent.drop(second, { dataTransfer: { files: [file()], types: ["Files"] } });
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
    const [a, b] = await rows();
    const input = (row: HTMLElement) => row.querySelector("input[type=file]")!;
    fireEvent.drop(a, { dataTransfer: { files: [file()], types: ["Files"] } });
    fireEvent.drop(b, { dataTransfer: { files: [file()], types: ["Files"] } });
    fireEvent.drop(b, { dataTransfer: { files: [file()], types: ["Files"] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    select(b);
    expect(within(inspector()).getByRole("button", { name: "Remove…" })).toBeDisabled();
    expect(input(b)).toBeDisabled();
    finishA();
    await waitFor(() => expect(input(a)).not.toBeDisabled());
    expect(input(b)).toBeDisabled();
    finishB();
    await waitFor(() => expect(input(b)).not.toBeDisabled());
    expect(within(inspector()).getByRole("button", { name: "Remove…" })).not.toBeDisabled();
  });
  it("preserves a failed load as an error with retry, not an empty list", async () => {
    jsonMock.mockRejectedValueOnce(new Error("offline"));
    page();
    expect(await screen.findByRole("alert")).toHaveTextContent("Channels could not be loaded");
    expect(screen.queryByText("No channels found.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await rows();
  });
  it("filters by name and image status and counts the visible rows", async () => {
    jsonMock.mockResolvedValue({
      items: [...channels, { cid: "30", name: "Music", hasImage: false, pid: null, depth: 0 }],
      channels: [],
    });
    page();
    await screen.findByText("Music");
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3 channels · 2 with an image");
    fireEvent.click(screen.getByRole("radio", { name: "Without" }));
    expect(screen.queryAllByText("General")).toHaveLength(0);
    expect(screen.getAllByText("Music").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".channel-row")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 channels");
    fireEvent.click(screen.getByRole("radio", { name: "With image" }));
    expect(document.querySelectorAll(".channel-row")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search channels" }), {
      target: { value: "mus" },
    });
    expect(document.querySelectorAll(".channel-row")).toHaveLength(0);
    expect(screen.getByText("No channels match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(document.querySelectorAll(".channel-row")).toHaveLength(3);
  });
  it("shows size, update time and the editor link of the selected channel", async () => {
    jsonMock.mockResolvedValue({
      items: [...channels, { cid: "30", name: "Music", hasImage: false, pid: null, depth: 0 }],
      channels: [],
    });
    page();
    const [first, , third] = await rows();
    expect(first).toHaveAttribute("aria-selected", "true");
    const panel = inspector();
    expect(within(panel).getByText("18 KB")).toBeInTheDocument();
    expect(within(panel).getByText("3 Nov 2026", { exact: false })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open in editor" })).toHaveAttribute(
      "href",
      "/?channel=10",
    );
    select(third);
    expect(third).toHaveAttribute("aria-selected", "true");
    expect(within(panel).getByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(within(panel).queryByText("Size")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Updated")).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open in editor" })).toHaveAttribute(
      "href",
      "/?channel=30",
    );
    expect(within(panel).getByRole("button", { name: "Remove…" })).toBeDisabled();
  });
  it("does not delete an image when confirmation is declined", async () => {
    page();
    await rows();
    fireEvent.click(within(inspector()).getByRole("button", { name: "Remove…" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("removes the selected channel's image after confirmation", async () => {
    page();
    const [, second] = await rows();
    select(second);
    fireEvent.click(within(inspector()).getByRole("button", { name: "Remove…" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/channels/20/image"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(showToast).toHaveBeenCalledWith("Image deleted.", "success");
  });
  it("places a rejected upload on the matching CID input and focuses it after upload ends", async () => {
    fetchMock.mockRejectedValueOnce(
      new ApiError("Image exceeds the upload limit.", "unknown", 413),
    );
    page();
    const [first, second] = await rows();
    fireEvent.drop(second, { dataTransfer: { files: [file()], types: ["Files"] } });
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
  page();
  await screen.findAllByText("Spacer");
  fireEvent.click(within(inspector()).getByRole("button", { name: "Remove…" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
  expect((await screen.findAllByText("Spacer base image")).length).toBeGreaterThan(0);
  const row = document.querySelector(".channel-row") as HTMLElement;
  expect(within(row).getByRole("img", { name: "Spacer" })).toBeInTheDocument();
  expect(within(inspector()).getByRole("button", { name: "Remove…" })).toBeDisabled();
});

it("replaces an input validation error when another file is dropped on the row", async () => {
  page();
  const [row] = await rows();
  const input = row.querySelector("input[type=file]")!;
  fireEvent.change(input, {
    target: { files: [new File(["text"], "note.txt", { type: "text/plain" })] },
  });
  expect(input).toHaveAttribute("aria-invalid", "true");
  const oversized = new File(["png"], "large.png", { type: "image/png" });
  Object.defineProperty(oversized, "size", { value: 50 * 1024 * 1024 });
  fireEvent.drop(row, { dataTransfer: { files: [oversized], types: ["Files"] } });
  expect(input).toHaveAccessibleDescription("Choose an image smaller than 10 MB.");
  expect(within(row).queryByText(/Choose a PNG, JPEG or WebP/)).not.toBeInTheDocument();
  const remove = within(inspector()).getByRole("button", { name: "Remove…" });
  remove.focus();
  fireEvent.drop(row, { dataTransfer: { files: [file()], types: ["Files"] } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(remove).not.toBeDisabled());
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(input).not.toHaveFocus();
  expect(within(row).queryByRole("alert")).not.toBeInTheDocument();
});
