import { api } from '../../../../lib/api';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RoomType } from '@/lib/room-management';
import { RoomTypesTab } from './room-types-tab';

jest.mock('../../../../lib/api', () => ({ api: jest.fn(), apiErrorMessage: (_error: unknown, fallback: string) => fallback }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const type = (id: string, title: string, amenities: string[] = []) => ({
  id, propertyId: 'p1', currentVersion: { id: `v-${id}`, title, category: 'single', bathroomType: 'shared', capacity: 1, pricePerTermUgx: 800000, amenities, photos: [], description: `${title} description` },
  pendingVersion: null, attachedRoomsCount: 0,
}) as unknown as RoomType;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const button = (text: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text)!;
it('initializes each edited specification and splits legacy desk/chair selections without losing custom features', async () => {
  await act(async () => root.render(<RoomTypesTab propertyId="p1" semesterId="s1" roomTypes={[type('1', 'Executive', ['Reading Desk & Chair', 'Custom light'])]} onRoomTypeSaved={() => {}} onRoomTypeDeleted={() => {}} />));
  await act(async () => button('Add Room Type').click());
  expect(container.querySelector<HTMLInputElement>('#rt-title')!.value).toBe('');
  await act(async () => button('Cancel').click());
  await act(async () => button('Edit Specifications').click());
  expect(container.querySelector<HTMLInputElement>('#rt-title')!.value).toBe('Executive');
  expect(button('Reading desk').getAttribute('aria-pressed')).toBe('true');
  expect(button('Chair').getAttribute('aria-pressed')).toBe('true');
  expect(button('Custom light').getAttribute('aria-pressed')).toBe('true');
  for (const feature of ['Bed', 'Mattress', 'Dressing mirror']) expect(button(feature)).toBeDefined();
});
it('requires a description as soon as a new type uses an existing name', async () => {
  await act(async () => root.render(<RoomTypesTab propertyId="p1" semesterId="s1" roomTypes={[type('1', 'Standard Single')]} onRoomTypeSaved={() => {}} onRoomTypeDeleted={() => {}} />));
  await act(async () => button('Add Room Type').click());
  const title = container.querySelector<HTMLInputElement>('#rt-title')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, ' standard   SINGLE '); title.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(container.querySelector<HTMLTextAreaElement>('#rt-desc')!.required).toBe(true);
  expect(container.querySelector('#rt-desc-hint')?.textContent).toContain('Another room type uses this name');
});


it('deletes an Ops-created specification through the visible confirmation without asking for review', async () => {
  const onDeleted=jest.fn();
  await act(async () => root.render(<RoomTypesTab propertyId="p1" semesterId="s1" roomTypes={[type('ops-type','Ops Standard')]} onRoomTypeSaved={()=>{}} onRoomTypeDeleted={onDeleted} />));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete room type Ops Standard"]')!.click());
  expect(container.querySelector('dialog[open]')?.textContent).toContain('Past booking and payment records are kept');
  jest.mocked(api).mockResolvedValueOnce({applied:true});
  await act(async () => button('Delete room type').click());
  expect(api).toHaveBeenCalledWith('/room-management/room-types/ops-type',{method:'DELETE'});
  expect(onDeleted).toHaveBeenCalledWith('ops-type');
});
