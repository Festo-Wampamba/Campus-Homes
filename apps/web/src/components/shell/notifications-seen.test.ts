import { notificationsSeenOn } from "./app-shell";

const nav = [
  { label: "Room changes", href: "/ops/room-changes", icon: null },
  { label: "Messages", href: "/messages", icon: null },
];
const unread = (id: string, href: string) => ({ id, templateKey: "x", payload: { href }, createdAt: "", readAt: null });

describe("notificationsSeenOn", () => {
  it("clears the page's badge notifications when that page is open", () => {
    expect(notificationsSeenOn([unread("n1", "/ops/room-changes")], "/ops/room-changes", nav)).toEqual(["n1"]);
  });

  it("clears them on a page nested under the nav item too", () => {
    expect(notificationsSeenOn([unread("n1", "/ops/room-changes")], "/ops/room-changes/abc", nav)).toEqual(["n1"]);
  });

  it("leaves another page's notifications alone", () => {
    expect(notificationsSeenOn([unread("n1", "/ops/room-changes")], "/ops/queue", nav)).toEqual([]);
  });

  // Chat notifications link to the inbox and name their thread separately;
  // opening Messages must not mark every thread read.
  it("leaves thread-specific message notifications alone", () => {
    const chat = { ...unread("n1", "/messages"), payload: { href: "/messages", threadId: "t1" } };
    expect(notificationsSeenOn([chat], "/messages", nav)).toEqual([]);
  });
});
