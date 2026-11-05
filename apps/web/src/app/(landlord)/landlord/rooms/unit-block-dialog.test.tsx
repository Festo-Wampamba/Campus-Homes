import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RoomUnit, UnitBlock } from '@/lib/room-management';
import { localDateTimeInput } from './unit-block-dialog';
import { RoomsInventoryTab } from './rooms-inventory-tab';
const mockApi = jest.fn();
const updated = jest.fn();
jest.mock('../../../../lib/api', () => ({ api: (...args: unknown[]) => mockApi(...args), apiErrorMessage: (error: Error) => error.message }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const room = (id: string, roomCode: string) => ({ id, roomCode, propertyId: 'p1', roomCategory: 'single', capacity: 1, roomTypeId: 't1', roomTypeTitle: 'Single', totalBeds: 1, occupiedBeds: 0, derivedStatus: 'available', beds: [{ id: `b${id}`, unitId: id, label: '1', blocked: false, status: 'available' }], activeBlock: null, scheduledBlocks: [] }) as RoomUnit;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { mockApi.mockReset(); updated.mockReset(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render(rooms: RoomUnit[]) {
  await act(async () => root.render(<RoomsInventoryTab propertyId="p1" semesterId="s1" roomTypes={[]} rooms={rooms} onRoomUpdated={updated} onRoomsUpdated={() => {}} applyImmediately onRoomsAdded={() => {}} onRoomsDeleted={() => {}} filterStatus="all" onFilterStatusChange={() => {}} />));
}
const buttons = (text: string) => Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.trim() === text);
const open = async (index: number) => act(async () => (container.querySelectorAll<HTMLButtonElement>('tbody button[title="Block Room"]')[index]!).click());
async function fill(selector: string, value: string) { await act(async () => { const input = container.querySelector<HTMLInputElement>(selector)!; Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); }

it('formats the date field in local time, including across midnight', () => {
  expect(localDateTimeInput(new Date(2026, 10, 5, 1, 29))).toBe('2026-11-05T01:29');
});
it('applies an immediate block to only the selected room and reports success', async () => {
  const a = room('a','A10'); await render([a, room('b','A13')]); await open(0);
  const block: UnitBlock = { id: 'block-a', unitId: 'a', reason: 'maintenance', startsAt: new Date().toISOString(), endsAt: null };
  mockApi.mockResolvedValueOnce({ ...block, room: { ...a, activeBlock: block, derivedStatus: 'blocked' } });
  await act(async () => container.querySelector<HTMLFormElement>('dialog[open] form')!.requestSubmit());
  expect(mockApi.mock.calls[0][0]).toBe('/room-management/rooms/a/blocks');
  expect(JSON.parse(mockApi.mock.calls[0][1].body)).toMatchObject({ startImmediately: true, endsAt: null });
  expect(updated).toHaveBeenCalledTimes(1); expect(updated.mock.calls[0][0].id).toBe('a');
  expect(container.querySelector('[role=status]')?.textContent).toContain('Room A10 is blocked');
});
it('does not carry errors, dates or notes from one room into another', async () => {
  await render([room('a','A10'),room('b','A13')]); await open(0);
  await fill('#block-ends', localDateTimeInput(new Date(Date.now() + 7200000)));
  await fill('#block-notes', 'Repair A10 only');
  mockApi.mockRejectedValueOnce(new Error('This room already has an overlapping active block'));
  await act(async () => container.querySelector<HTMLFormElement>('dialog[open] form')!.requestSubmit());
  expect(container.querySelector('[role=alert]')?.textContent).toContain('overlapping');
  await act(async () => buttons('Cancel')[0]!.click()); await open(1);
  expect(container.querySelector('[role=alert]')).toBeNull();
  expect(container.querySelector<HTMLInputElement>('#block-ends')?.value).toBe('');
  expect(container.querySelector<HTMLTextAreaElement>('#block-notes')?.value).toBe('');
});
it('rejects an already expired end before sending a request', async () => {
  await render([room('a','A10')]); await open(0);
  await fill('#block-ends', '2020-01-01T01:29');
  await act(async () => container.querySelector<HTMLFormElement>('dialog[open] form')!.requestSubmit());
  expect(mockApi).not.toHaveBeenCalled(); expect(container.querySelector('[role=alert]')?.textContent).toContain('future');
});
