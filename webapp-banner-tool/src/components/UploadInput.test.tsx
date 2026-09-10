import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import UploadInput from "./UploadInput";

it("connects a rejected dropped file to its input, focuses it, and clears the error on correction", async () => {
  const onFile = vi.fn();
  render(<UploadInput id="source-file" onFile={onFile} />);
  const input = document.getElementById("source-file")!;
  fireEvent.drop(input.closest("label")!, {
    dataTransfer: { files: [new File(["text"], "note.txt", { type: "text/plain" })] },
  });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", "source-file-error");
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a PNG, JPEG or WebP");
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, {
    target: { files: [new File(["png"], "image.png", { type: "image/png" })] },
  });
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(onFile).toHaveBeenCalledTimes(1);
});

it("focuses a server-rejected file after its upload lock is released", async () => {
  const { rerender } = render(
    <UploadInput id="source-file" onFile={vi.fn()} disabled error="Image is too large." />,
  );
  const input = document.getElementById("source-file")!;
  expect(input).not.toHaveFocus();
  rerender(<UploadInput id="source-file" onFile={vi.fn()} error="Image is too large." />);
  await waitFor(() => expect(input).toHaveFocus());
  expect(input).toHaveAccessibleDescription("Image is too large.");
});
