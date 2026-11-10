import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LandlordTenant } from '@campushomes/shared';
import { TenantEmergencyContactButton } from './tenant-emergency-contact';
const mockApi = jest.fn(), mockRefresh = jest.fn();
jest.mock('../../lib/api',()=>({...jest.requireActual('../../lib/api'),api:(...args:unknown[])=>mockApi(...args)}));
jest.mock('next/navigation',()=>({useRouter:()=>({refresh:mockRefresh})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const tenant:LandlordTenant={reservationId:'11111111-1111-4111-8111-111111111111',bedId:'b',status:'booked',propertyId:'p',propertyName:'Courts',unitId:'u',roomLabel:'A01',bedLabel:'Bed 1',name:'James Kato',phone:null,email:null,emergencyContactName:null,emergencyContactPhone:null,totalUgx:800000,paidUgx:230000,balanceUgx:570000,portalStatus:'private'};
let container:HTMLDivElement,root:Root;
const button=(name:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent===name)!;
function type(input:HTMLInputElement,value:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
beforeEach(()=>{mockApi.mockReset();mockRefresh.mockReset();container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
it('adds missing emergency details and refreshes the saved tenant record',async()=>{
 await act(async()=>root.render(<TenantEmergencyContactButton tenant={tenant}/>));
 await act(async()=>button('Add emergency contact').click());
 const inputs=container.querySelectorAll('input');
 await act(async()=>{type(inputs[0]!,' Grace Kato ');type(inputs[1]!,'0771 234567');});
 mockApi.mockResolvedValue({emergencyContactName:'Grace Kato',emergencyContactPhone:'+256771234567'});
 await act(async()=>container.querySelector('form')!.requestSubmit());
 expect(mockApi).toHaveBeenCalledWith(`/reservations/${tenant.reservationId}/emergency-contact`,{method:'PATCH',body:JSON.stringify({emergencyContactName:'Grace Kato',emergencyContactPhone:'+256771234567'})});
 expect(mockRefresh).toHaveBeenCalledTimes(1);expect(container.querySelector('dialog')).toBeNull();
});
it('loads existing contacts and sends explicit blanks to clear the booking override',async()=>{
 await act(async()=>root.render(<TenantEmergencyContactButton tenant={{...tenant,emergencyContactName:'Old Kin',emergencyContactPhone:'+256772222222'}}/>));
 await act(async()=>button('Edit emergency contact').click());
 const inputs=container.querySelectorAll('input');expect(inputs[0]!.value).toBe('Old Kin');
 await act(async()=>{type(inputs[0]!,'');type(inputs[1]!,'');});mockApi.mockResolvedValue({});
 await act(async()=>container.querySelector('form')!.requestSubmit());
 expect(JSON.parse(mockApi.mock.calls[0][1].body)).toEqual({emergencyContactName:'',emergencyContactPhone:''});
});
it('keeps invalid or failed edits visible without changing the tenant',async()=>{
 await act(async()=>root.render(<TenantEmergencyContactButton tenant={tenant}/>));await act(async()=>button('Add emergency contact').click());
 const inputs=container.querySelectorAll('input');await act(async()=>type(inputs[1]!,'wrong'));
 await act(async()=>container.querySelector('form')!.requestSubmit());expect(mockApi).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')!.textContent).toContain('valid emergency phone');
 await act(async()=>type(inputs[1]!,'0771 234567'));mockApi.mockRejectedValue(new Error('offline'));
 await act(async()=>container.querySelector('form')!.requestSubmit());expect(container.querySelector('[role="alert"]')!.textContent).toContain('Could not update');expect(container.querySelector('dialog')).not.toBeNull();expect(mockRefresh).not.toHaveBeenCalled();
});
