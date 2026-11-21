/**
 * JobHeaderCard — presentational primitive. Snapshot-style assertions
 * verify the canonical identity block renders deterministically across
 * surfaces (JobDetail, PodReport).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobHeaderCard } from "@/components/ui-kit/JobHeaderCard";

const status = { backgroundColor: "#007AFF", color: "#fff", label: "Assigned" };

describe("JobHeaderCard", () => {
  it("renders job ref, plate, status and vehicle line", () => {
    render(
      <JobHeaderCard
        jobRef="AX1234"
        vehicleReg="AB12 CDE"
        status={status}
        make="Ford"
        model="Focus"
        colour="Blue"
        year={2022}
      />,
    );
    expect(screen.getByText("Job AX1234")).toBeTruthy();
    expect(screen.getByText("Assigned")).toBeTruthy();
    expect(screen.getByText(/Ford Focus/)).toBeTruthy();
    expect(screen.getByText("Blue")).toBeTruthy();
    expect(screen.getByText(/2022/)).toBeTruthy();
  });

  it("omits vehicle line when no vehicle data present", () => {
    render(
      <JobHeaderCard jobRef="AX1" vehicleReg="AB12 CDE" status={status} />,
    );
    expect(screen.queryByText(/—/)).toBeNull();
  });

  it("renders client and email when provided", () => {
    render(
      <JobHeaderCard
        jobRef="AX1"
        vehicleReg="AB12 CDE"
        status={status}
        client="Acme Logistics"
        clientEmail="ops@acme.test"
      />,
    );
    expect(screen.getByText(/Acme Logistics · ops@acme.test/)).toBeTruthy();
  });

  it("renders rightSlot and children", () => {
    render(
      <JobHeaderCard
        jobRef="AX1"
        vehicleReg="AB12 CDE"
        status={status}
        rightSlot={<span data-testid="badges">b</span>}
      >
        <span data-testid="progress">p</span>
      </JobHeaderCard>,
    );
    expect(screen.getByTestId("badges")).toBeTruthy();
    expect(screen.getByTestId("progress")).toBeTruthy();
  });
});

describe("JobHeaderCard vehicle image", () => {
  it("renders the catalogue image panel when a path is provided", () => {
    render(
      <JobHeaderCard
        jobRef="AX1"
        vehicleReg="AB12 CDE"
        status={status}
        make="BMW"
        model="X5"
        vehicleImagePath="bmw-x5-2019-2023-black.png"
      />,
    );
    expect(screen.getByTestId("vehicle-catalogue-image")).toBeTruthy();
    // setup.ts patches HTMLImageElement#src, so read the attribute React set.
    const img = screen.getByAltText("BMW X5 illustration");
    expect(img.getAttribute("src")).toContain("/storage/v1/object/public/vehicle-images/bmw-x5-2019-2023-black.png");
  });

  it("omits the panel when there is no image", () => {
    render(<JobHeaderCard jobRef="AX1" vehicleReg="AB12 CDE" status={status} make="BMW" model="X5" />);
    expect(screen.queryByTestId("vehicle-catalogue-image")).toBeNull();
  });

  it("rejects unsafe paths", () => {
    render(
      <JobHeaderCard jobRef="AX1" vehicleReg="AB12 CDE" status={status} vehicleImagePath="../secret/x.png" />,
    );
    expect(screen.queryByTestId("vehicle-catalogue-image")).toBeNull();
  });
});
