/**
 * 0073: chat only between a student and the landlord they reserved with, and
 * landlord ratings only from a student who reserved AND messaged that landlord.
 */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';

import { NoopRealtime } from '../../src/adapters/realtime.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { ChatService } from '../../src/modules/chat/chat.service';
import { LandlordRatingsService } from '../../src/modules/landlord-ratings/landlord-ratings.service';
import { testDatabaseUrl } from '../test-database-url';
import { seedReservation } from './reservation-fixture';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rlsDb = new RlsDb(pool);
const chat = new ChatService(rlsDb, new NoopRealtime());
const ratings = new LandlordRatingsService(rlsDb);

let reservedStudent: string;
let otherStudent: string;
let landlord: string;
let otherLandlord: string;
let threadId: string;
let legacyThreadId: string;

const as = (userId: string, role: RlsContext['role']): RlsContext => ({ userId, role });

beforeAll(async () => {
  await pool.query(`TRUNCATE users, students, landlords, semesters, chat_threads, chat_messages CASCADE`);
  const user = async (phone: string, role: string, name: string) =>
    (await pool.query(`INSERT INTO users (phone, role, status, name) VALUES ($1, $2, 'active', $3) RETURNING id`, [phone, role, name]))
      .rows[0].id as string;
  reservedStudent = await user('+256710000401', 'student', 'Reserved Student');
  otherStudent = await user('+256710000402', 'student', 'Other Student');
  landlord = await user('+256710000403', 'landlord', 'Reserved Landlord');
  otherLandlord = await user('+256710000404', 'landlord', 'Other Landlord');
  await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK'), ($2, 'MUK')`, [reservedStudent, otherStudent]);
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'Reserved Landlord', 'verified'), ($2, 'Other Landlord', 'verified')`,
    [landlord, otherLandlord],
  );
  const reservationId = await seedReservation(pool, reservedStudent, landlord, 'chat-rule');
  // The other landlord has a hostel too, but this student never reserved there.
  await seedReservation(pool, otherStudent, otherLandlord, 'other-landlord');
  threadId = (await chat.ensureThread(as(reservedStudent, 'student'), reservationId)).id;
  // A pre-0073 conversation: started before any reservation existed.
  legacyThreadId = (await pool.query(
    `INSERT INTO chat_threads (student_id, landlord_id) VALUES ($1, $2) RETURNING id`,
    [otherStudent, landlord],
  )).rows[0].id as string;
});

afterAll(async () => {
  await pool.query(`TRUNCATE users, semesters CASCADE`);
  await pool.end();
});

describe('chat is limited to the landlord of a reserved hostel', () => {
  it("lists only the landlord of the student's reserved hostel as a contact", async () => {
    const contacts = await chat.contacts(as(reservedStudent, 'student'));

    expect(contacts.map((c: { userId: string }) => c.userId)).toEqual([landlord]);
  });

  it('refuses a chat with a landlord the student never reserved with', async () => {
    await expect(chat.ensureDirectThread(as(reservedStudent, 'student'), otherLandlord)).rejects.toThrow(ForbiddenException);
  });

  it('refuses a landlord starting a chat with a student who never reserved with them', async () => {
    await expect(chat.ensureDirectThread(as(landlord, 'landlord'), otherStudent)).rejects.toThrow(ForbiddenException);
  });

  it('hides a pre-reservation conversation from the inbox', async () => {
    await expect(chat.myThreads(as(otherStudent, 'student'))).resolves.toEqual([]);
  });

  it('refuses sending in a pre-reservation conversation', async () => {
    await expect(chat.sendMessage(as(otherStudent, 'student'), legacyThreadId, 'Hello?')).rejects.toThrow(ForbiddenException);
  });

  it('refuses reading a pre-reservation conversation', async () => {
    await expect(chat.messages(as(landlord, 'landlord'), legacyThreadId)).rejects.toThrow(ForbiddenException);
  });
});

describe('landlord ratings before the student has messaged', () => {
  it('does not offer a rating yet', async () => {
    const mine = await ratings.mine(as(reservedStudent, 'student'), landlord);

    expect(mine.canRate).toBe(false);
  });

  it('refuses a rating before any message', async () => {
    await expect(ratings.rate(as(reservedStudent, 'student'), { landlordId: landlord, rating: 4 })).rejects.toThrow(ForbiddenException);
  });

  it('refuses a rating from a student who never reserved with the landlord', async () => {
    await expect(ratings.rate(as(otherStudent, 'student'), { landlordId: landlord, rating: 1 })).rejects.toThrow(ForbiddenException);
  });
});

describe('landlord ratings after the student has reserved and messaged', () => {
  beforeAll(async () => {
    await chat.sendMessage(as(reservedStudent, 'student'), threadId, 'Is water available all day?');
  });

  it('offers a rating', async () => {
    const mine = await ratings.mine(as(reservedStudent, 'student'), landlord);

    expect(mine.canRate).toBe(true);
  });

  it('records the rating and comment', async () => {
    const rating = await ratings.rate(as(reservedStudent, 'student'), { landlordId: landlord, rating: 5, comment: 'Replies fast' });

    expect([rating.rating, rating.comment]).toEqual([5, 'Replies fast']);
  });

  it('refuses a second rating for the same landlord', async () => {
    await expect(ratings.rate(as(reservedStudent, 'student'), { landlordId: landlord, rating: 1 })).rejects.toThrow(ConflictException);
  });

  it("shows the student their own rating and doesn't offer another", async () => {
    const mine = await ratings.mine(as(reservedStudent, 'student'), landlord);

    expect([mine.canRate, mine.rating?.rating]).toEqual([false, 5]);
  });

  it('shows the landlord their ratings without the student identity', async () => {
    const summary = await ratings.aboutMe(as(landlord, 'landlord'));

    expect(summary).toEqual({ average: 5, count: 1, items: [{ rating: 5, comment: 'Replies fast', createdAt: expect.any(String) }] });
  });

  it("shows another landlord none of this landlord's ratings", async () => {
    const summary = await ratings.aboutMe(as(otherLandlord, 'landlord'));

    expect(summary.count).toBe(0);
  });
});
