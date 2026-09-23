import { renderToStaticMarkup } from "react-dom/server";

import { StaffInvitations } from "./staff-invitations";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Invitee",
  email: "invitee@campushomes.ug",
  phone: null,
  roleKey: "ops_lead",
  scopeType: "platform_wide",
  scopeId: null,
  reason: "hire",
  deliveredAt: null,
  deliveryAttempts: 1,
  lastDeliveryError: null,
};

function render(status: string, expiresAt: string) {
  return renderToStaticMarkup(<StaffInvitations rows={[{ ...base, status, expiresAt }]} />);
}

describe("StaffInvitations", () => {
  it("labels an unclicked pending invitation past its expiry as Expired", () => {
    expect(render("pending", "2000-01-01T00:00:00Z")).toContain("Expired");
  });

  it("offers Re-invite on an expired invitation", () => {
    expect(render("pending", "2000-01-01T00:00:00Z")).toContain("Re-invite");
  });

  it("offers Delete on a cancelled invitation", () => {
    expect(render("cancelled", "2099-01-01T00:00:00Z")).toContain("Delete");
  });

  it("offers Edit on a live pending invitation", () => {
    expect(render("pending", "2099-01-01T00:00:00Z")).toContain(">Edit<");
  });

  it("offers no Delete on a live pending invitation", () => {
    expect(render("pending", "2099-01-01T00:00:00Z")).not.toContain(">Delete<");
  });
});
