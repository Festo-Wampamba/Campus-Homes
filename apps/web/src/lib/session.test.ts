import { needsProfileSetup, type SessionUser } from "./session";

jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const complete: SessionUser = {
  id: "u1", role: "student", status: "active", name: "Sarah Nakato", username: "sarah_n",
  email: null, phoneNumber: null, contactPhone: "+256772123456", gender: "female",
};

describe("needsProfileSetup", () => {
  it("lets a complete profile through", () => {
    expect(needsProfileSetup(complete)).toBe(false);
  });

  it("asks for a contact phone the API reports as missing", () => {
    expect(needsProfileSetup({ ...complete, contactPhone: null })).toBe(true);
  });

  // An older API that doesn't send contactPhone must not loop users through onboarding.
  it("does not gate when the API doesn't report a contact phone at all", () => {
    expect(needsProfileSetup({ ...complete, contactPhone: undefined })).toBe(false);
  });

  it("asks a student with no gender to pick one", () => {
    expect(needsProfileSetup({ ...complete, gender: null })).toBe(true);
  });

  it("asks a landlord with no gender to pick one", () => {
    expect(needsProfileSetup({ ...complete, role: "landlord", gender: null })).toBe(true);
  });

  it("does not ask staff for a gender", () => {
    expect(needsProfileSetup({ ...complete, role: "admin", gender: null })).toBe(false);
  });

  it("does not gate when the API doesn't report a gender at all", () => {
    expect(needsProfileSetup({ ...complete, gender: undefined })).toBe(false);
  });

  it("still asks for a missing username", () => {
    expect(needsProfileSetup({ ...complete, username: null })).toBe(true);
  });
});
