import { needsProfileSetup, type SessionUser } from "./session";

jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const complete: SessionUser = {
  id: "u1", role: "student", status: "active", name: "Sarah Nakato", username: "sarah_n",
  email: null, phoneNumber: null, contactPhone: "+256772123456",
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

  it("still asks for a missing username", () => {
    expect(needsProfileSetup({ ...complete, username: null })).toBe(true);
  });
});
