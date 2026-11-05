import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RoomType } from '@/lib/room-management';
import { RoomTypeDialog } from './room-type-dialog';
const mockApi=jest.fn(),mockUpload=jest.fn(),mockSaved=jest.fn(),mockClose=jest.fn();
jest.mock('../../../../lib/api',()=>({...jest.requireActual('../../../../lib/api'),api:(...args:unknown[])=>mockApi(...args)}));
jest.mock('../../../../lib/cloudinary',()=>({listingPhotoUrl:()=>null,uploadToCloudinary:(...args:unknown[])=>mockUpload(...args)}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
let host:HTMLDivElement,root:Root;
const current={id:'rt1',propertyId:'p1',currentVersion:{id:'v1',title:'Executive',category:'single',bathroomType:'shared',capacity:1,pricePerTermUgx:800000,depositUgx:null,amenities:[],photos:[]},pendingVersion:null,attachedRoomsCount:0} as unknown as RoomType;
beforeEach(()=>{mockApi.mockReset();mockUpload.mockReset();mockSaved.mockReset();mockClose.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
async function render(edit=false){await act(async()=>root.render(<RoomTypeDialog open propertyId="p1" semesterId="s1" roomType={edit?current:null} roomTypes={[]} onSaved={mockSaved} onOpenChange={mockClose}/>));}
async function choose(file:File){const input=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(input,'files',{value:[file],configurable:true});await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise((resolve)=>setTimeout(resolve,40));});}
const value=(id:string,text:string)=>{const input=host.querySelector<HTMLInputElement>(id)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));};
it.each([false,true])('uploads an empty-MIME Windows photo and saves its key (edit=%s)',async(edit)=>{
  mockApi.mockImplementation(async(path:string)=>path==='/uploads/sign'?{provider:'b2',uploadUrl:'https://storage.example.test/put',publicUrl:'https://storage.example.test/uploads/owner/photo'}:current);
  mockUpload.mockResolvedValue({publicId:'https://storage.example.test/uploads/owner/photo'});
  await render(edit);await choose(new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'Bedroom.PNG',{type:''}));
  expect(mockUpload).toHaveBeenCalled();expect((mockUpload.mock.calls[0]![0] as File).type).toBe('image/png');
  expect(host.textContent).toContain('Room Photographs (1/10)');
  if(!edit)await act(async()=>{value('#rt-title','Executive');value('#rt-price','800000');});
  await act(async()=>host.querySelector('form')!.requestSubmit());
  const saved=mockApi.mock.calls.find((call)=>call[0]!== '/uploads/sign')!;
  expect(saved[0]).toBe(edit?'/room-management/room-types/rt1':'/room-management/properties/p1/room-types');
  expect(JSON.parse(saved[1].body).photos[0]).toMatchObject({storageKey:'https://storage.example.test/uploads/owner/photo',isPrimary:true});
  expect(mockSaved).toHaveBeenCalled();
});
it('shows unsupported image errors beside the photo controls and retains edits',async()=>{
  await render(true);await choose(new File(['not a JPEG'],'room.jpg',{type:'image/jpeg'}));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('JPEG, PNG or WebP');
  expect(host.querySelector<HTMLInputElement>('#rt-title')!.value).toBe('Executive');expect(mockApi).not.toHaveBeenCalled();
  const event=new Event('cancel',{cancelable:true});host.querySelector('dialog')!.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
});
