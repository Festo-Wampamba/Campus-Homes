import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PublishListingForm } from './publish-listing-form';

const mockApi=jest.fn();
jest.mock('next/navigation',()=>({useRouter:()=>({push:jest.fn(),refresh:jest.fn()})}));
jest.mock('../../../../../lib/api',()=>({api:(...args:unknown[])=>mockApi(...args),ApiError:class extends Error{}}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;

it.each([false,true])('lets Ops finish without inventing or recreating room types (prior inventory: %s)',async(inventoryInitialized)=>{
  mockApi.mockImplementation(async(path:string)=>path.includes('/rooms?')?[]:{
    listing:{propertyId:'p1',semesterId:'s1',status:'draft'},property:{name:'Empty inventory',proposedRoomCategories:inventoryInitialized?[{category:'double',roomCount:5,pricePerTermUgx:600000}]:[],proposedAmenities:{}},inventoryInitialized,
    visitPhotoCount:0,visitPhotos:[],version:null,photos:[],
  });
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  try{
    await act(async()=>root.render(<PublishListingForm listingId="listing1"/>));
    expect(container.querySelectorAll('[id^="publish-room-category-"]')).toHaveLength(0);
    const finish=[...container.querySelectorAll('a')].find((link)=>link.textContent?.includes('Finish verification'));
    expect(finish?.getAttribute('href')).toBe('/ops');
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(container.textContent).toContain('Finish verification without publishing, or add the real room inventory');
    expect(mockApi.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
  }finally{act(()=>root.unmount());container.remove();}
});
