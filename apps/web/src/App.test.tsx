import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("redirects an unauthenticated visitor to the login screen (REQ-6.7)", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "AI Defense Platform" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Log in" })).toBeInTheDocument();
  });
});
