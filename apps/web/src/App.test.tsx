import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the Phase 1 placeholder shell", () => {
    render(<App />);
    expect(screen.getByText("AI Defense Platform")).toBeInTheDocument();
  });
});
