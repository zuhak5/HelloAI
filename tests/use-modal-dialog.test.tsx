// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useRef, useState } from "react";
import { useModalDialog } from "@/lib/use-modal-dialog";

function Harness({ dismissible }: { dismissible: boolean }) {
  const [open, setOpen] = useState(true);
  const initialRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalDialog<HTMLElement>(open, () => setOpen(false), initialRef, dismissible);

  return (
    <>
      <button type="button">Outside</button>
      {open ? (
        <section ref={dialogRef} role="dialog" aria-label="Test dialog" tabIndex={-1}>
          <button ref={initialRef} type="button">First</button>
          <button type="button">Last</button>
        </section>
      ) : <span>Closed</span>}
    </>
  );
}

afterEach(cleanup);

describe("useModalDialog", () => {
  test("ignores Escape while dismissal is disabled", () => {
    render(<Harness dismissible={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeInTheDocument();
  });

  test("closes on Escape when dismissal is enabled", () => {
    render(<Harness dismissible />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  test("returns focus to the dialog when focus moved outside", async () => {
    render(<Harness dismissible />);
    const first = screen.getByRole("button", { name: "First" });
    await waitFor(() => expect(first).toHaveFocus());
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
  });
});
