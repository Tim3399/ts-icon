import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Button } from "../primitives/Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { FileButton } from "./FileButton";
import { ListRow, ListSection } from "./ListSection";
import { MenuButton } from "./MenuButton";
import { PageHeader } from "./PageHeader";
import { StatusGlyph } from "./StatusGlyph";
import { ToolbarButton } from "./Toolbar";

describe("Button", () => {
  it("defaults to gray and marks the accent and destructive roles", () => {
    render(
      <MemoryRouter>
        <Button>Gray</Button>
        <Button variant="prominent">Primary</Button>
        <Button variant="plain">Link</Button>
        <Button variant="plain" destructive>
          Remove
        </Button>
      </MemoryRouter>,
    );
    expect(screen.getByText("Gray")).toHaveAttribute("data-variant", "gray");
    expect(screen.getByText("Gray")).not.toHaveAttribute("data-accent");
    expect(screen.getByText("Primary")).toHaveAttribute("data-accent", "primary");
    expect(screen.getByText("Link")).toHaveAttribute("data-accent", "link");
    expect(screen.getByText("Remove")).toHaveAttribute("data-destructive");
    expect(screen.getByText("Remove")).not.toHaveAttribute("data-accent");
  });
});

describe("ToolbarButton", () => {
  it("is named and titled by its label", () => {
    render(<ToolbarButton icon="refresh" label="Refresh" />);
    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button).toHaveAttribute("title", "Refresh");
  });
});

describe("PageHeader", () => {
  it("renders the title, the subtitle and the toolbar", () => {
    render(
      <PageHeader
        title="Channels"
        subtitle="One sentence."
        toolbar={<ToolbarButton icon="refresh" label="Refresh" />}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Channels" })).toBeVisible();
    expect(screen.getByText("One sentence.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeVisible();
  });
});

describe("ListSection and ListRow", () => {
  it("lists rows under a header and hands a dropped file to the row", () => {
    const onDropFile = vi.fn();
    render(
      <ListSection header="Images" footer="Footer text." id="images">
        <ListRow title="General" subtitle="Own image" onDropFile={onDropFile} data-testid="row" />
      </ListSection>,
    );
    expect(screen.getByRole("list", { name: "Images" })).toBeVisible();
    const row = screen.getByTestId("row");
    const file = new File(["x"], "a.png", { type: "image/png" });
    const data = { types: ["Files"], files: [file] };
    fireEvent.dragOver(row, { dataTransfer: data });
    expect(row).toHaveAttribute("data-drag-over");
    fireEvent.drop(row, { dataTransfer: data });
    expect(row).not.toHaveAttribute("data-drag-over");
    expect(onDropFile).toHaveBeenCalledWith(file);
  });
});

describe("FileButton", () => {
  it("passes the chosen file on", () => {
    const onFile = vi.fn();
    render(<FileButton onFile={onFile} />);
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Replace…"), { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("wires a rejected file's message to the input and focuses it", () => {
    render(<FileButton id="replace-a" onFile={vi.fn()} error="Use PNG, JPEG or WebP." />);
    const input = screen.getByLabelText("Replace…");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Use PNG, JPEG or WebP.");
    expect(input).toHaveFocus();
  });

  it("is not invalid without an error", () => {
    render(<FileButton id="replace-b" onFile={vi.fn()} />);
    const input = screen.getByLabelText("Replace…");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

describe("MenuButton", () => {
  it("opens, moves with the arrows, closes with Escape and returns focus", () => {
    const onSelect = vi.fn();
    render(
      <MenuButton
        label="alice"
        header="Signed in as alice"
        items={[
          { label: "Light", checked: false, onSelect },
          { label: "Log out", onSelect },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "alice" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const light = screen.getByRole("menuitemradio", { name: "Light" });
    expect(light).toHaveFocus();
    fireEvent.keyDown(light, { key: "ArrowDown" });
    const logout = screen.getByRole("menuitem", { name: "Log out" });
    expect(logout).toHaveFocus();
    fireEvent.keyDown(logout, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveFocus();
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("ConfirmDialog", () => {
  it("focuses Cancel, cancels with Escape and marks the destructive confirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        destructive
        title="Remove image?"
        message="This cannot be undone."
        confirmLabel="Remove"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("alertdialog", { name: "Remove image?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Remove" })).toHaveAttribute("data-destructive");
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="t"
        message="m"
        confirmLabel="Go"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("StatusGlyph", () => {
  it("shows a text label next to the glyph", () => {
    render(<StatusGlyph tone="positive" label="Managed" />);
    expect(screen.getByText("Managed")).toBeVisible();
  });
});
