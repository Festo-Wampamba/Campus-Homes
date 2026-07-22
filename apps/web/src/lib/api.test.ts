import { ApiError, apiErrorMessage } from "./api";

describe("apiErrorMessage", () => {
  it("surfaces the field and actionable Zod issue", () => {
    const error = new ApiError(400, {
      statusCode: 400,
      message: "Validation failed",
      errors: [{ path: ["phone"], message: "Enter a Ugandan mobile number such as +256 771 234 567" }],
    });

    expect(apiErrorMessage(error, "Could not save user")).toBe(
      "phone: Enter a Ugandan mobile number such as +256 771 234 567",
    );
  });

  it("preserves database conflict messages", () => {
    const error = new ApiError(409, { message: "That email address is already in use" });
    expect(apiErrorMessage(error, "Could not save user")).toBe("That email address is already in use");
  });
});
