# Tenant import room matching — 6 November 2026

The importer matches spreadsheet property/room values to the landlord’s free-bed inventory and fills the room selector automatically. Numeric bed labels such as `1` match `Bed 1`. Explicit bed choices are assigned before room-only entries, and each bed is used once per batch. Room-only rows receive distinct free beds within the same physical room.

If the supplied bed label does not match but the named room has one free bed, that bed is selected with a visible substitution notice. For example, A03 / bed 2 can use A03’s sole free Bed 1 after review. A missing room, conflicting property/room identity, exhausted room or unmatched explicit bed with several choices stays unresolved with a specific message. A02 and A2 remain distinct room codes. Property names must match; the importer does not guess between differently named properties.

The inventory response now includes property and physical-room IDs to distinguish duplicate names. Existing ownership filters, maintenance/occupancy checks, account acceptance rules and transactional booking checks are retained. A client-side match does not guarantee availability until the server saves the booking/request.

Refresh beds retries unresolved assignments while preserving edited student fields, payments and retry keys. No selected room displays “Select a room first” instead of zero rent or a false overpayment warning. The preview separates Property, Room and Requested bed into labeled columns. Template instructions explain optional bed selection.

Validation: 19 focused frontend tests and 9 import/parser/template tests passed. Browser checks passed in Chromium, Firefox and WebKit at 375px and 1440px using the real intake dialog with intercepted API writes: upload two rows, auto-select the two correct rooms, review, enable Save, and send both correct bed IDs/payment values. No hosted students, bookings or uploads were created. The temporary fixture is excluded from the release. CI additionally exercises the database-backed intake test, including the new identity fields.
