import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UsersManager, type UserRow } from './users-manager';
const mockApi = jest.fn();
jest.mock('../../../../lib/api', () => ({ ...jest.requireActual('../../../../lib/api'), api: (...args: unknown[]) => mockApi(...args) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
const row: UserRow = { id:'user-1', name:'Resident Example', role:'student', status:'active' };
beforeEach(async () => {
  mockApi.mockReset(); container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async () => root.render(<UsersManager rows={[row]} roles={[]} permissions={[]} properties={[]} canMutate canBlock />));
});
afterEach(() => { act(() => root.unmount());container.remove();jest.restoreAllMocks(); });
async function reason(text: string) {
  await act(async () => {
    const input=container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,text);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
test('Block and Unblock keep the user row and send the selected action with an explanation', async () => {
  await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Block')!.click());
  await reason('Awaiting documents'); mockApi.mockResolvedValueOnce({id:row.id,status:'suspended'});
  await act(async () => container.querySelector('form')!.requestSubmit());
  expect(JSON.parse(mockApi.mock.calls[0][1].body)).toEqual({blocked:true,reason:'Awaiting documents'});
  expect(container.textContent).toContain(row.name);
  await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Unblock')!.click());
  await reason('Documents received'); mockApi.mockResolvedValueOnce({id:row.id,status:'active'});
  await act(async () => container.querySelector('form')!.requestSubmit());
  expect(JSON.parse(mockApi.mock.calls[1][1].body)).toEqual({blocked:false,reason:'Documents received'});
  expect(container.textContent).toContain(row.name);
});
test('permanent deletion uses its visible confirmation rather than a second browser popup', async () => {
  const confirm=jest.spyOn(window,'confirm');
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete user"]')!.click());
  await reason('Duplicate account');
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  mockApi.mockResolvedValueOnce({deleted:true});
  await act(async () => container.querySelector('form')!.requestSubmit());
  expect(mockApi).toHaveBeenCalledWith('/admin/users/user-1',expect.objectContaining({method:'DELETE',body:JSON.stringify({reason:'Duplicate account'})}));
  expect(confirm).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Delete user"]')).toBeNull();
});
