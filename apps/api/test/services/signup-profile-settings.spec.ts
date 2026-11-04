import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { profileOnboardingSchema, updateLandlordContactSchema, updateSelfParticularsSchema } from '@campushomes/shared';
import { RlsDb } from '../../src/db/db.module';
import { ProvisioningService } from '../../src/modules/auth/provisioning.service';
import type { AuthenticatedRequest } from '../../src/modules/auth/auth.guard';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import type { LogtoProfileSync } from '../../src/modules/auth/logto-profile-sync';
import { MeController } from '../../src/modules/profile/me.controller';
import { updateSelfParticulars } from '../../src/modules/profile/particulars';
import { LandlordsService } from '../../src/modules/landlords/landlords.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { resolveAccountAccess } from '../../src/modules/auth/access-resolver';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl() });
const db = new RlsDb(pool);
const provisioning = new ProvisioningService(db);
const sync = { push: jest.fn() } as unknown as LogtoProfileSync;
const controller = new MeController(db, {} as LogtoManagementClient, sync);
const service = new LandlordsService(db, new AuditService(db));
function req(id: string, role='student') { return { effectiveRole:role,session:{user:{id,role},access:{roles:[role],assurance:{mfaVerified:false}}} } as unknown as AuthenticatedRequest; }
async function fresh(sub: string) { return (await provisioning.provision({ sub,email:`${sub}@example.test`,emailVerified:true },'consumer'))!; }
beforeAll(async()=>{await pool.query('TRUNCATE users CASCADE');});
afterAll(()=>pool.end());
it('finishes a native sign-up as landlord without silently retaining student access',async()=>{
  const user=await fresh('signup-landlord-choice');
  await controller.completeOnboarding(req(user.id),{accountType:'landlord',name:'Owner',username:'repeatable',contactPhone:'+256772123456',gender:'male'});
  const access=await resolveAccountAccess(db,user.id);
  expect(access?.roles).toEqual(['landlord']);expect(access?.workspaces).toEqual(['landlord']);
  expect((await pool.query('SELECT role FROM users WHERE id=$1',[user.id])).rows[0].role).toBe('landlord');
});
it('does not convert an existing student profile through registration',async()=>{
  const user=await fresh('signup-existing-student');await pool.query("INSERT INTO students(user_id,university) VALUES($1,'MUK')",[user.id]);
  await expect(controller.completeOnboarding(req(user.id),{accountType:'landlord',name:'Existing',username:'repeatable',contactPhone:'+256772123456',gender:'male'})).rejects.toBeInstanceOf(ForbiddenException);
  expect((await resolveAccountAccess(db,user.id))?.roles).toEqual(['student']);
});
it('updates only own username/contact details and leaves sign-in identities and roles intact',async()=>{
  const user=await fresh('signup-settings');
  await updateSelfParticulars(db,{userId:user.id,role:'student'},updateSelfParticularsSchema.parse({username:'REPEATABLE',contactPhone:'+256772123456',role:'admin',email:'attacker@example.test'}),sync);
  expect((await pool.query('SELECT username,role,email,phone,contact_phone FROM users WHERE id=$1',[user.id])).rows[0]).toMatchObject({username:'repeatable',role:'student',email:'signup-settings@example.test',phone:null,contact_phone:'+256772123456'});
});
it('lets a verified landlord update WhatsApp without changing verification or another owner',async()=>{
  const owner=await fresh('signup-verified-owner'),other=await fresh('signup-other-owner');
  await pool.query("INSERT INTO landlords(user_id,legal_name,kyc_status) VALUES($1,'Verified owner','verified'),($2,'Other owner','verified')",[owner.id,other.id]);
  await service.updateContact({userId:owner.id,role:'landlord'},{whatsappNumber:'+256772123456'});
  expect((await pool.query('SELECT user_id,kyc_status,whatsapp_number FROM landlords WHERE user_id=ANY($1)',[[owner.id,other.id]])).rows).toEqual(expect.arrayContaining([
    {user_id:owner.id,kyc_status:'verified',whatsapp_number:'+256772123456'}, {user_id:other.id,kyc_status:'verified',whatsapp_number:null},
  ]));
  expect(updateLandlordContactSchema.safeParse({whatsappNumber:'+256772123456',legalName:'Changed'}).success).toBe(false);
  expect(updateLandlordContactSchema.safeParse({whatsappNumber:'123'}).success).toBe(false);
});

it('rolls back the initial role choice when profile validation fails',async()=>{
  const user=await fresh('signup-atomic-choice');
  await expect(controller.completeOnboarding(req(user.id),{accountType:'landlord',name:'Owner',username:'repeatable',contactPhone:'+256772123456'})).rejects.toBeInstanceOf(BadRequestException);
  expect((await resolveAccountAccess(db,user.id))?.roles).toEqual(['student']);
  expect((await pool.query('SELECT role,username FROM users WHERE id=$1',[user.id])).rows[0]).toEqual({role:'student',username:null});
  expect(profileOnboardingSchema.safeParse({accountType:'admin',name:'Owner',username:'owner',contactPhone:'+256772123456'}).success).toBe(false);
});
