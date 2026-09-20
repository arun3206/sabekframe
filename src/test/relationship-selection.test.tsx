import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seasonalCampaign } from "@/config/relationships";
import { RelationshipSelection } from "@/features/portrait-flow/components/relationship-selection";
import { PORTRAIT_FLOW_STORAGE_KEY } from "@/features/portrait-flow/storage";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("RelationshipSelection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pushMock.mockClear();
  });

  it("shows all enabled experiences with Little Krishna first and featured", () => {
    render(<RelationshipSelection />);

    const relationships = screen.getAllByRole("radio");

    expect(relationships).toHaveLength(6);
    expect(relationships[0]).toHaveAccessibleName(/Little Krishna/i);
    expect(screen.getByText("Janmashtami Special")).toBeVisible();
    expect(screen.getByRole("radio", { name: /Brother & Sister/i })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Radha Krishna Couple/i })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Mother & Little Radha/i })).toBeVisible();
    expect(
      screen.getByRole("radio", { name: /Grandparent & Grandchild/i }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /Father & Child/i })).toBeVisible();
  });

  it("shows seasonal copy only when the campaign is enabled", () => {
    const { rerender } = render(<RelationshipSelection />);

    expect(screen.getByText(seasonalCampaign.message)).toBeVisible();

    rerender(
      <RelationshipSelection campaign={{ ...seasonalCampaign, enabled: false }} />,
    );

    expect(screen.queryByText(seasonalCampaign.message)).not.toBeInTheDocument();
  });

  it("keeps Continue disabled until a relationship is selected", async () => {
    const user = userEvent.setup();
    render(<RelationshipSelection />);

    const disabledButton = screen.getByRole("button", {
      name: "Select a Relationship",
    });
    expect(disabledButton).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Mother & Little Radha/i }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("allows exactly one selected relationship and exposes checked state", async () => {
    const user = userEvent.setup();
    render(<RelationshipSelection />);

    const siblingOption = screen.getByRole("radio", { name: /Brother & Sister/i });
    const fatherOption = screen.getByRole("radio", { name: /Father & Child/i });

    await user.click(siblingOption);
    expect(siblingOption).toBeChecked();

    await user.click(fatherOption);
    expect(fatherOption).toBeChecked();
    expect(siblingOption).not.toBeChecked();
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("persists a selection and restores it when the page is revisited", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RelationshipSelection />);

    await user.click(screen.getByRole("radio", { name: /Grandparent & Grandchild/i }));

    expect(window.localStorage.getItem(PORTRAIT_FLOW_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, relationship: "grandparent-grandchild" }),
    );

    unmount();
    render(<RelationshipSelection />);

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: /Grandparent & Grandchild/i }),
      ).toBeChecked();
    });
  });

  it("ignores invalid stored relationship IDs", async () => {
    window.localStorage.setItem(
      PORTRAIT_FLOW_STORAGE_KEY,
      JSON.stringify({ version: 1, relationship: "not-a-relationship" }),
    );

    render(<RelationshipSelection />);

    await waitFor(() => {
      expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
    });
    expect(screen.getByRole("button", { name: "Select a Relationship" })).toBeDisabled();
  });

  it("supports keyboard selection", async () => {
    const user = userEvent.setup();
    render(<RelationshipSelection />);

    const siblingOption = screen.getByRole("radio", { name: /Brother & Sister/i });
    siblingOption.focus();
    await user.keyboard(" ");

    expect(siblingOption).toBeChecked();
  });

  it("navigates to upload after Continue", async () => {
    const user = userEvent.setup();
    render(<RelationshipSelection />);

    await user.click(screen.getByRole("radio", { name: /Brother & Sister/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(pushMock).toHaveBeenCalledWith("/create");
  });
});
