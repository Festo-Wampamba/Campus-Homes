import { renderToStaticMarkup } from "react-dom/server";

import { StudentShell } from "./student-shell";

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("../presence/presence-heartbeat", () => ({ PresenceHeartbeat: () => null }));
jest.mock("../shell/idle-timeout", () => ({
  IdleTimeout: ({ signInPath }: { signInPath: string }) => <span data-idle-timeout={signInPath} />,
}));

const user = { id: "u1", name: "Kato Samuel", email: null, phoneNumber: null, role: "student" } as never;

it("signs students out after inactivity, like every other signed-in shell", () => {
  const html = renderToStaticMarkup(<StudentShell user={user} access={{} as never}><p>page</p></StudentShell>);

  expect(html).toContain('data-idle-timeout="/sign-in"');
});
