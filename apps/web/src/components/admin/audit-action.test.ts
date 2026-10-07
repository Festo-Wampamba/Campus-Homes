import { BadgeCheck, ShieldCheck } from "lucide-react";

import { auditIcon, auditTone, describeAuditAction } from "./audit-action";

describe("describeAuditAction", () => {
  it("turns a snake_case key into a past-tense sentence", () => {
    expect(describeAuditAction("landlord_account.approve").text).toBe("Landlord account approved");
  });

  it("singularises plural resource names", () => {
    expect(describeAuditAction("roles.assign").text).toBe("Role assigned");
  });

  it("keeps compound verbs readable", () => {
    expect(describeAuditAction("users.permissions_grant").text).toBe("User permissions granted");
  });

  it("handles three-part keys", () => {
    expect(describeAuditAction("staff.invitation.accept").text).toBe("Staff invitation accepted");
  });
});

describe("auditTone", () => {
  it("marks destructive actions as negative", () => {
    expect(auditTone("users.delete")).toBe("negative");
  });

  it("marks approvals as positive", () => {
    expect(auditTone("landlord_account.approve")).toBe("positive");
  });
});

describe("auditIcon", () => {
  it("uses a verification badge for landlord actions", () => {
    expect(auditIcon("landlord_account.approve")).toBe(BadgeCheck);
  });

  it("uses a shield for role changes", () => {
    expect(auditIcon("roles.assign")).toBe(ShieldCheck);
  });
});
