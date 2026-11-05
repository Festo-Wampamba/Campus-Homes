import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WalkInStudentButton } from "./walk-in-student-dialog";
const mockApi = jest.fn();
jest.mock("../../lib/api", () => ({ ...jest.requireActual("../../lib/api"), api: (...args: unknown[]) => mockApi(...args) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
const BED = { id: "5f0c2a9e-1111-4222-8333-444455556666", propertyName: "Mirembe", roomLabel: "Single 3", bedLabel: "Bed 1", roomCategory: "single", selfContained: false, pricePerTermUgx: 900000 };
const BED2 = { ...BED, id: "5f0c2a9e-1111-4222-8333-444455556667", roomLabel: "Single 4" };
let container: HTMLDivElement, root: Root;
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);
  input.dispatchEvent(new Event("input",{bubbles:true}));
}
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
const fields = () => [...container.querySelectorAll("fieldset")];
function field(label: string, at = 0) { return [...fields()[at]!.querySelectorAll("label")].find((l) => l.textContent?.startsWith(label))!.querySelector("input")!; }
async function open(beds=[BED]) { await act(async()=>root.render(<WalkInStudentButton beds={beds}/>)); await act(async()=>button("Add students").click()); }
async function fill(at=0) { await act(async()=>{type(field("Full name",at),"Amina Nakato");type(field("Phone number",at),"0771 234567");}); }
beforeEach(()=>{ mockApi.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container); });
afterEach(()=>{act(()=>root.unmount());container.remove();});
it("saves a new student with normalized phone and a retry key",async()=>{
  await open();await fill();
  mockApi.mockImplementation(async(_path,options)=>JSON.parse(options.body).entries.map((row:{idempotencyKey:string})=>({key:row.idempotencyKey,status:"added"})));
  await act(async()=>container.querySelector("form")!.requestSubmit());
  const payload=JSON.parse(mockApi.mock.calls[0][1].body).entries[0];
  expect(mockApi.mock.calls[0][0]).toBe("/reservations/tenant-intake");
  expect(payload).toMatchObject({kind:"new",phone:"+256771234567",bedId:BED.id,name:"Amina Nakato",movedIn:false});
  expect(payload.idempotencyKey.length).toBeGreaterThan(15);
  expect(container.textContent).toContain("Student added and bed booked");
});
it("calculates balance and prevents overpayment without scroll spinners",async()=>{
  await open();expect(container.querySelector("output")!.textContent).toBe("UGX\u00a0900,000");
  await act(async()=>type(field("Amount paid"),"300000"));
  expect(container.querySelector("output")!.textContent).toBe("UGX\u00a0600,000");
  await act(async()=>type(field("Amount paid"),"900001"));
  expect(button("Save student").disabled).toBe(true);
  expect(container.querySelector('input[type="number"]')).toBeNull();
});
it("saves a mixed batch and retries only the failed student",async()=>{
  await open([BED,BED2]);await fill();await act(async()=>button("Add another student").click());
  await act(async()=>{const select=fields()[1]!.querySelector("select")!;select.value="existing";select.dispatchEvent(new Event("change",{bubbles:true}));});
  await act(async()=>type(field("Verified email",1),"existing@example.com"));
  mockApi.mockImplementationOnce(async(_path,options)=>JSON.parse(options.body).entries.map((row:{idempotencyKey:string},i:number)=>({key:row.idempotencyKey,status:i?"failed":"added",message:"Try another contact"})));
  await act(async()=>container.querySelector("form")!.requestSubmit());
  expect(JSON.parse(mockApi.mock.calls[0][1].body).entries.map((row:{kind:string})=>row.kind)).toEqual(["new","existing"]);
  await act(async()=>type(field("Verified email",1),"correct@example.com"));
  mockApi.mockImplementationOnce(async(_path,options)=>JSON.parse(options.body).entries.map((row:{idempotencyKey:string})=>({key:row.idempotencyKey,status:"requested"})));
  await act(async()=>container.querySelector("form")!.requestSubmit());
  expect(JSON.parse(mockApi.mock.calls[1][1].body).entries).toHaveLength(1);
  expect(container.textContent).toContain("No booking is made until they accept");
});
it("explains managed-only approval instead of asking landlords to publish",async()=>{
  await open([]);expect(container.textContent).toContain("Managed-only properties do not need a public listing");expect(button("Save student").disabled).toBe(true);
});
it("reports validation beside the affected student without posting",async()=>{
  await open();await fill();await act(async()=>type(field("Phone number"),"12345"));
  await act(async()=>container.querySelector("form")!.requestSubmit());
  expect(mockApi).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')?.textContent).toContain("Ugandan mobile");
});
