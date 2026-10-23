import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchClient } from "./search-client";
const mockApi=jest.fn(); const mockPush=jest.fn(); let mockParams="";
jest.mock("../../../lib/api",()=>({...jest.requireActual("../../../lib/api"),api:(...args:unknown[])=>mockApi(...args)}));
jest.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(mockParams),usePathname:()=>"/search",useRouter:()=>({push:mockPush})}));
jest.mock("../../../components/map/listings-map",()=>({ListingsMap:()=>null}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
let container:HTMLDivElement; let root:Root; let client:QueryClient;
beforeEach(()=>{mockParams="";mockApi.mockReset();mockPush.mockReset();window.matchMedia=()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}} as unknown as MediaQueryList);container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);client=new QueryClient({defaultOptions:{queries:{retry:false}}});mockApi.mockResolvedValue({items:[],total:0,page:1,pageSize:20,hasMore:false});});
afterEach(()=>{act(()=>root.unmount());client.clear();container.remove();});
async function settle(){for(let i=0;i<5;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
async function renderSearch(){await act(async()=>root.render(<QueryClientProvider client={client}><SearchClient/></QueryClientProvider>));await settle();}
function button(text:string){return [...container.querySelectorAll("button")].find(button=>button.textContent?.includes(text))!;}
describe("discovery states",()=>{
  it("distinguishes inventory emptiness from a filtered zero",async()=>{await renderSearch();expect(container.textContent).toContain("No available inspected hostels here yet");expect(String(mockApi.mock.calls[0][0])).toContain("/listings/search-page?");});
  it("retains the query on failure and offers retry",async()=>{mockApi.mockRejectedValue(new Error("offline"));await renderSearch();expect(container.textContent).toContain("couldn't load the hostels");expect(container.textContent).not.toContain("No available inspected hostels");});
  it("keeps filter edits local until Apply",async()=>{await renderSearch();await act(async()=>button("All filters").click());const select=container.querySelector<HTMLSelectElement>('[aria-label="Gender"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")!.set!.call(select,"female_only");select.dispatchEvent(new Event("change",{bubbles:true}));});expect(mockPush).not.toHaveBeenCalled();await act(async()=>button("Apply filters").click());expect(mockPush.mock.calls[0][0]).toContain("genderArrangement=female_only");});
  it("renders a shared filter URL as a filtered empty result",async()=>{mockParams="roomCategory=double&selfContained=true";await renderSearch();expect(container.textContent).toContain("No hostels match this search");expect(String(mockApi.mock.calls[0][0])).toContain("selfContained=true");});
});
