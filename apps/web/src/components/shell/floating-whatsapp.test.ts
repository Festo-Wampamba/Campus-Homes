import { clampFloatingPosition, type FloatingObstacle } from "./floating-whatsapp";

const viewport = { width: 390, height: 844 };

it("keeps a moved shortcut inside the viewport and above the phone action bar", () => {
  const phoneBar: FloatingObstacle = { left: 0, top: 744, right: 390, bottom: 844 };

  const position = clampFloatingPosition({ left: 310, top: 780 }, viewport, [phoneBar]);

  expect(position.left).toBeGreaterThanOrEqual(20);
  expect(position.left + 56).toBeLessThanOrEqual(370);
  expect(position.top).toBeLessThanOrEqual(680);
  expect(position.top + 56).toBeLessThanOrEqual(phoneBar.top - 8);
});

it("steps around a fixed cookie notice while preserving the requested side when possible", () => {
  const notice: FloatingObstacle = { left: 12, top: 710, right: 378, bottom: 832 };

  const position = clampFloatingPosition({ left: 300, top: 700 }, viewport, [notice]);

  expect(position.left).toBeGreaterThanOrEqual(20);
  expect(position.left + 56).toBeLessThanOrEqual(370);
  expect(position.top + 56).toBeLessThanOrEqual(notice.top - 8);
});
