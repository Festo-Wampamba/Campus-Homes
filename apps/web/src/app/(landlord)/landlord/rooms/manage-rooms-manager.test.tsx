import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { RoomManagementOverview, RoomUnit } from '@/lib/room-management';
import { ManageRoomsManager } from './manage-rooms-manager';

const mockRefresh = jest.fn();
const mockApi = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }), usePathname: () => '/landlord/rooms', useSearchParams: () => new URLSearchParams() }));
jest.mock('../../../../lib/api', () => ({ api: (...args: unknown[]) => mockApi(...args), apiErrorMessage: (_e: unknown, fallback: string) => fallback }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

it('updates an edited batch with one refresh instead of one per room', async () => {
  const rooms = [1, 2].map((n) => ({ id: `r${n}`, roomCode: `R${n}`, roomTypeId: 't1', roomTypeTitle: 'Single', totalBeds: 1, occupiedBeds: 0, derivedStatus: 'available', beds: [{ id: `b${n}`, blocked: false, status: 'available' }] })) as RoomUnit[];
  const property = { id: 'p1', name: 'Managed property', listingIntent: 'manage_only', manageReviewStatus: 'approved' };
  const data = { property, properties: [property], semesters: [{ id: 's1', name: 'Term' }], currentSemester: { id: 's1', name: 'Term' }, changeSet: null, rooms, roomTypes: [{ id: 't1', currentVersion: { title: 'Single', capacity: 1, category: 'single', bathroomType: 'shared', pricePerTermUgx: 800000, photos: [], amenities: [] }, pendingVersion: null }] } as unknown as RoomManagementOverview;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<ManageRoomsManager initialData={data} />));
    await act(async () => { for (const box of container.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')) box.click(); });
    await act(async () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Edit selected (2)'))!.click());
    expect(container.querySelector('dialog[open]')?.textContent).toContain('apply immediately');
    mockApi.mockResolvedValueOnce(rooms.map((room) => ({ ...room, roomCode: `New-${room.roomCode}` })));
    await act(async () => container.querySelector<HTMLFormElement>('dialog[open] form')!.requestSubmit());
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('New-R1');
    expect(container.textContent).toContain('New-R2');
  } finally { act(() => root.unmount()); container.remove(); }
});
