import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { OwnerPropertyTeam } from '@campushomes/shared';
import { api } from '../../../../lib/api';
import { PropertyTeam } from './property-team';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('../../../../lib/api', () => ({ api: jest.fn().mockResolvedValue({}), apiErrorMessage: (_e: unknown, fallback: string) => fallback }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const data: OwnerPropertyTeam = { properties: [{ id: first, name: 'Makerere hostel' }, { id: second, name: 'MUBS hostel' }],
  members: [{ id: 'member-id', propertyId: second, propertyName: 'MUBS hostel', name: 'Caretaker', email: 'caretaker@example.test',
    role: 'custodian', workerType: null, capabilities: ['students.view'], status: 'active', startsAt: new Date().toISOString() }] };
let container: HTMLDivElement, root: Root;
beforeEach(async () => { jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async () => root.render(<PropertyTeam data={data} initialPropertyId={second} />)); });
afterEach(() => {act(() => root.unmount());container.remove();});
function button(text: string) { return [...container.querySelectorAll('button')].find(b => b.textContent === text)!; }

it('opens the requested property and carries it into management delegation', () => {
  expect(container.querySelector('select')?.value).toBe(second);
  expect(container.textContent).toContain('Caretaker');
  expect(container.querySelector('a[href*="/landlord/management"]')?.getAttribute('href')).toBe(`/landlord/management?propertyId=${second}&new=1`);
});
it('posts the chosen property, ground role and worker duties', async () => {
  await act(async () => button('Assign custodian or worker').click());
  const role=container.querySelectorAll('select')[1];
  await act(async () => {role.value='property_worker';role.dispatchEvent(new Event('change',{bubbles:true}));});
  container.querySelector<HTMLInputElement>('input[name="email"]')!.value='WORKER@example.test';
  container.querySelector<HTMLSelectElement>('select[name="workerType"]')!.value='maintenance_worker';
  container.querySelector<HTMLTextAreaElement>('textarea')!.value='Maintain this property';
  await act(async () => {container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(api).toHaveBeenCalledWith('/property-team/assignments',expect.objectContaining({method:'POST',body:JSON.stringify({
    propertyId:second,email:'worker@example.test',role:'property_worker',workerType:'maintenance_worker',capabilities:[],reason:'Maintain this property',
  })}));
});
it('requires confirmation before removing only the chosen assignment', async () => {
  await act(async () => button('Remove assignment').click());
  expect(api).not.toHaveBeenCalled();
  await act(async () => button('Confirm').click());
  expect(api).toHaveBeenCalledWith('/property-team/memberships/member-id',{method:'DELETE'});
});
it('filters the roster when the owner chooses another property', async () => {
  const select=container.querySelector('select')!;
  await act(async () => {select.value=first;select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(container.textContent).not.toContain('Caretaker');
  expect(container.textContent).toContain('No custodians or workers assigned');
});
it('saves the permissions the landlord ticks for a team member', async () => {
  await act(async () => button('Change permissions').click());
  const payments=[...container.querySelectorAll('label')].find(l => l.textContent==='Record rent payments')!.querySelector('input')!;
  await act(async () => payments.click());
  await act(async () => button('Save permissions').click());
  expect(api).toHaveBeenCalledWith('/property-team/memberships/member-id/capabilities',
    expect.objectContaining({method:'PATCH',body:JSON.stringify({capabilities:['students.view','payments.record']})}));
});
