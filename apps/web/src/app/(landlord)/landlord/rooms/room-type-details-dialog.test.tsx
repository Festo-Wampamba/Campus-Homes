import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RoomType, RoomTypeVersion, RoomUnit } from '@/lib/room-management';
import { api } from '@/lib/api';
import { RoomTypeDetailsDialog } from './room-type-details-dialog';
import { RoomsInventoryTab } from './rooms-inventory-tab';
import { RoomTypesTab } from './room-types-tab';

jest.mock('../../../../lib/api', () => ({ api: jest.fn(), apiErrorMessage: (_error: unknown, fallback: string) => fallback }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const version = { id: 'v1', roomTypeId: 't1', versionNumber: 1, title: 'Executive Single', category: 'single', bathroomType: 'ensuite', capacity: 2, sizeSqm: 20, description: 'Spacious room with a reading desk.', amenities: ['Reading desk', 'Bed'], semesterId: 's1', pricePerTermUgx: 800000, depositUgx: 0, status: 'approved', photos: [] } as RoomTypeVersion;
const type: RoomType = { id: 't1', propertyId: 'p1', currentVersion: version, attachedRoomsCount: 2, createdAt: '' };
const room: RoomUnit = { id: 'r1', propertyId: 'p1', roomTypeId: 't1', roomTypeTitle: version.title, roomCategory: 'single', roomCode: 'A1', buildingName: 'Block A', floorLabel: 'Ground', capacity: 2, totalBeds: 2, occupiedBeds: 2, derivedStatus: 'fully_occupied', beds: [{ id: 'b1', unitId: 'r1', label: 'Bed 1', blocked: false, status: 'occupied' }, { id: 'b2', unitId: 'r1', label: 'Bed 2', blocked: false, status: 'booked' }] };
const blocked: RoomUnit = { ...room, id: 'r2', roomCode: 'A2', occupiedBeds: 0, derivedStatus: 'blocked', beds: room.beds.map((bed) => ({ ...bed, id: `${bed.id}-r2`, status: 'available' })), activeBlock: { id: 'block1', unitId: 'r2', reason: 'maintenance', startsAt: '2026-11-05T09:00:00Z', endsAt: null, notes: 'Repair the door.' } };
let host: HTMLDivElement, root: Root;
beforeEach(() => { jest.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const viewer = () => host.querySelector('[aria-label="Room type details"]')!;
it('shows current prices and details, separates proposed changes, and excludes same-name types from occupancy totals', async () => {
  const proposed = { ...version, id: 'v2', pricePerTermUgx: 1000000, status: 'pending_review' as const, description: 'Proposed new layout' };
  await act(async () => root.render(<RoomTypeDetailsDialog roomType={{ ...type, pendingVersion: proposed }} room={room} rooms={[room, blocked, { ...room, id: 'other', roomTypeId: 't2', roomTypeTitle: version.title }]} semesters={[{ id: 's1', name: 'Semester 1' }]} onClose={() => {}} />));
  const current = viewer().querySelector('[aria-label="Current room type specification"]')!;
  expect(current.textContent).toContain('800,000');expect(current.textContent).not.toContain('1,000,000');
  expect(current.textContent).toContain('Spacious room');expect(current.textContent).toContain('Reading desk');expect(current.textContent).toContain('20 m²');expect(current.textContent).toContain('Semester 1');expect(current.textContent).toContain('UGX\u00a00');
  expect(viewer().querySelector('summary')!.textContent).toContain('Proposed changes');
  const totals = [...viewer().querySelectorAll('dt')].slice(0, 4).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
  expect(totals).toEqual([['Physical rooms','2'],['Total beds','4'],['Allocated beds','2'],['Available beds','0']]);
  const selected = viewer().querySelector('[aria-label="Selected room A1"]')!;
  expect(selected.textContent).toContain('Occupied');expect(selected.textContent).toContain('Booked — awaiting move-in');
  expect(api).not.toHaveBeenCalled();
});
it('shows room maintenance and scheduled blocks without mislabelling beds as available', async () => {
  await act(async () => root.render(<RoomTypeDetailsDialog roomType={type} room={{ ...blocked, scheduledBlocks: [{ id: 'future', unitId: 'r2', reason: 'renovation', startsAt: '2026-12-01T09:00:00Z', notes: 'Paint walls' }] }} rooms={[blocked]} onClose={() => {}} />));
  const selected = viewer().querySelector('[aria-label="Selected room A2"]')!;
  expect(selected.textContent).toContain('Blocked with room');expect(selected.textContent).toContain('Routine Maintenance');expect(selected.textContent).toContain('Repair the door.');expect(selected.textContent).toContain('No scheduled end');expect(selected.textContent).toContain('Scheduled: Room Renovation');expect(selected.textContent).toContain('EAT');
});
it.each([0,1])('opens details from inventory title (responsive rendering %s) with the exact type ID', async (index) => {
  const other = { ...type, id: 't2', currentVersion: { ...version, id: 'other', pricePerTermUgx: 1200000 } };
  await act(async () => root.render(<RoomsInventoryTab propertyId="p1" semesterId="s1" roomTypes={[type,other]} rooms={[room]} applyImmediately onRoomUpdated={() => {}} onRoomsUpdated={() => {}} onRoomsAdded={() => {}} onRoomsDeleted={() => {}} filterStatus="all" onFilterStatusChange={() => {}} />));
  await act(async () => host.querySelectorAll<HTMLButtonElement>('[aria-label="View Executive Single details for room A1"]')[index]!.click());
  expect(viewer().textContent).toContain('800,000');expect(viewer().textContent).not.toContain('1,200,000');expect(viewer().textContent).toContain('Room A1');expect(api).not.toHaveBeenCalled();
  await act(async () => [...viewer().querySelectorAll('button')].find((button) => button.textContent === 'Close details')!.click());expect(host.querySelector('[aria-label="Room type details"]')).toBeNull();
});
it('opens the same details view from the specifications card without entering edit mode', async () => {
  await act(async () => root.render(<RoomTypesTab propertyId="p1" semesterId="s1" roomTypes={[type]} rooms={[room]} onRoomTypeSaved={() => {}} />));
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'View details')!.click());expect(viewer().textContent).toContain('Spacious room');expect(host.querySelector('form')).toBeNull();expect(api).not.toHaveBeenCalled();
});
it('shows missing specifications and empty rooms explicitly instead of inventing zero prices', async () => {
  await act(async () => root.render(<RoomTypeDetailsDialog roomType={null} room={room} rooms={[room]} onClose={() => {}} />));expect(viewer().textContent).toContain('specifications are unavailable');expect(viewer().textContent).not.toContain('UGX');
  await act(async () => root.render(<RoomTypeDetailsDialog roomType={{ ...type, currentVersion: null, pendingVersion: { ...version, status: 'draft' } }} rooms={[]} onClose={() => {}} />));expect(viewer().textContent).toContain('Draft specification');expect(viewer().textContent).toContain('No physical rooms are attached yet.');
});

it('does not label an older approved specification as a pending price proposal', async () => {
  await act(async () => root.render(<RoomTypeDetailsDialog roomType={{ ...type, pendingVersion: { ...version, id: 'old-approved', pricePerTermUgx: 500000 } }} rooms={[room]} onClose={() => {}} />));
  expect(viewer().querySelector('summary')).toBeNull();expect(viewer().textContent).toContain('800,000');expect(viewer().textContent).not.toContain('500,000');
});
