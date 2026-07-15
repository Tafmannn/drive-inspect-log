import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FaqAccordion } from "../components/FaqAccordion";
import type { Faq } from "../content/marketingContent";

const items: Faq[] = [
  { key: "a", question: "Does Axentra transport on a lorry?", answer: "No, driven movements only." },
  { key: "b", question: "Which areas do you cover?", answer: "UK-wide coverage." },
];

describe("FaqAccordion", () => {
  it("renders each question as a button", () => {
    render(<FaqAccordion items={items} />);
    expect(screen.getByRole("button", { name: /transport on a lorry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /which areas/i })).toBeInTheDocument();
  });

  it("reveals an answer when its question is activated", async () => {
    render(<FaqAccordion items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /transport on a lorry/i }));
    expect(await screen.findByText(/driven movements only/i)).toBeInTheDocument();
  });
});
