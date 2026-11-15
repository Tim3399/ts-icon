import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChannelTreeRow } from "./ChannelTreeRow";

function renderRow(props: Parameters<typeof ChannelTreeRow>[0]) {
  const view = render(
    <ul>
      <ChannelTreeRow {...props} />
    </ul>,
  );
  const pill = view.container.querySelector(".channel-tree-pill") as HTMLElement;
  const name = () => screen.getByText(props.name);
  return { ...view, pill, name };
}

describe("ChannelTreeRow", () => {
  it("indents by depth", () => {
    const { container } = renderRow({ name: "Music", depth: 2 });
    expect((container.querySelector(".channel-tree-row") as HTMLElement).style.paddingLeft).toBe(
      "20px",
    );
  });

  describe("spacer without a banner shows its name (C2)", () => {
    it("when it has no image", () => {
      const { pill, name } = renderRow({ name: "[spacer]Lobby", depth: 0, isSpacer: true });
      expect(pill.dataset.kind).toBe("spacer-text");
      expect(name()).not.toHaveClass("channel-tree-name-hidden");
      expect(pill.querySelector("img")).toBeNull();
    });

    it("when its image fails to load", () => {
      const { pill, name } = renderRow({
        name: "[spacer]Lobby",
        depth: 0,
        isSpacer: true,
        image: "https://x.test/missing.png",
      });
      fireEvent.error(pill.querySelector("img")!);
      expect(pill.dataset.kind).toBe("spacer-text");
      expect(name()).not.toHaveClass("channel-tree-name-hidden");
      expect(pill.querySelector("img")).toBeNull();
    });

    it("but hides the name once the banner has loaded", () => {
      const { pill, name } = renderRow({
        name: "[spacer]Lobby",
        depth: 0,
        isSpacer: true,
        image: "https://x.test/spacer.png",
      });
      fireEvent.load(pill.querySelector("img")!);
      expect(pill.dataset.kind).toBe("spacer");
      expect(name()).toHaveClass("channel-tree-name-hidden");
    });
  });

  describe("parent channels (C3)", () => {
    it("a parent whose banner URL does not load is a normal channel row with its icon", () => {
      const { pill } = renderRow({
        name: "Gaming",
        depth: 0,
        hasChildren: true,
        image: "https://x.test/by-id/11.png",
      });
      expect(pill.dataset.kind).toBe("channel");
      fireEvent.error(pill.querySelector("img")!);
      expect(pill.dataset.kind).toBe("channel");
      expect(pill.querySelector(".channel-tree-icon")).not.toBeNull();
    });

    it("a parent without any image is a normal channel row", () => {
      const { pill } = renderRow({ name: "Gaming", depth: 0, hasChildren: true });
      expect(pill.dataset.kind).toBe("channel");
      expect(pill.querySelector(".channel-tree-icon")).not.toBeNull();
    });

    it("a parent whose banner has loaded is a group", () => {
      const { pill } = renderRow({
        name: "Gaming",
        depth: 0,
        hasChildren: true,
        image: "https://x.test/by-id/11.png",
      });
      fireEvent.load(pill.querySelector("img")!);
      expect(pill.dataset.kind).toBe("group");
      expect(pill.querySelector(".channel-tree-icon")).toBeNull();
    });

    it("a channel without sub-channels stays a channel even with a loaded banner", () => {
      const { pill } = renderRow({ name: "CS", depth: 1, image: "https://x.test/by-id/12.png" });
      fireEvent.load(pill.querySelector("img")!);
      expect(pill.dataset.kind).toBe("channel");
    });
  });

  it("starts over when the banner source changes", () => {
    const { pill, rerender } = renderRow({
      name: "[spacer]A",
      depth: 0,
      isSpacer: true,
      image: "data:image/png;base64,AAA",
    });
    fireEvent.load(pill.querySelector("img")!);
    expect(pill.dataset.kind).toBe("spacer");
    rerender(
      <ul>
        <ChannelTreeRow name="[spacer]A" depth={0} isSpacer image="data:image/png;base64,BBB" />
      </ul>,
    );
    expect(pill.dataset.kind).toBe("spacer-text");
  });

  it("is a pressed-state button when selectable", () => {
    const onSelect = vi.fn();
    renderRow({ name: "Music", depth: 0, selected: true, onSelect });
    const button = screen.getByRole("button", { name: "Music" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalled();
  });

  it("names the banner when an alt text is given", () => {
    renderRow({
      name: "General",
      depth: 0,
      image: "data:image/png;base64,AAA",
      imageAlt: "Banner",
    });
    expect(screen.getByAltText("Banner")).toBeInTheDocument();
  });
});
