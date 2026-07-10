# Graph Report - .  (2026-07-05)

## Corpus Check
- Corpus is ~22,885 words - fits in a single context window. You may not need a graph.

## Summary
- 1094 nodes · 1207 edges · 69 communities (64 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 1.0)
- Token cost: 42,860 input · 2,222 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Shared Zod Schema Package|Shared Zod Schema Package]]
- [[_COMMUNITY_Properties Table Columns|Properties Table Columns]]
- [[_COMMUNITY_Users Table Columns|Users Table Columns]]
- [[_COMMUNITY_Users Table Columns (dup)|Users Table Columns (dup)]]
- [[_COMMUNITY_API package.json Dependencies|API package.json Dependencies]]
- [[_COMMUNITY_Property Documents Columns|Property Documents Columns]]
- [[_COMMUNITY_Drizzle Column Metadata A|Drizzle Column Metadata A]]
- [[_COMMUNITY_Drizzle Column Metadata B|Drizzle Column Metadata B]]
- [[_COMMUNITY_Property Documents Columns (dup)|Property Documents Columns (dup)]]
- [[_COMMUNITY_Migration 0000 Snapshot|Migration 0000 Snapshot]]
- [[_COMMUNITY_Students Table Columns|Students Table Columns]]
- [[_COMMUNITY_Landlords Table Columns|Landlords Table Columns]]
- [[_COMMUNITY_Landlords Table Columns (dup)|Landlords Table Columns (dup)]]
- [[_COMMUNITY_Migration 0001 Snapshot|Migration 0001 Snapshot]]
- [[_COMMUNITY_Landlords Foreign Keys|Landlords Foreign Keys]]
- [[_COMMUNITY_Landlords Foreign Keys (dup)|Landlords Foreign Keys (dup)]]
- [[_COMMUNITY_Property Documents Foreign Keys|Property Documents Foreign Keys]]
- [[_COMMUNITY_Property Documents Foreign Keys (dup)|Property Documents Foreign Keys (dup)]]
- [[_COMMUNITY_Shared Enum Definitions|Shared Enum Definitions]]
- [[_COMMUNITY_Verification Tokens Table Meta|Verification Tokens Table Meta]]
- [[_COMMUNITY_Sessions Table Meta|Sessions Table Meta]]
- [[_COMMUNITY_Verification Tokens Table Meta (dup)|Verification Tokens Table Meta (dup)]]
- [[_COMMUNITY_Sessions Table Meta (dup)|Sessions Table Meta (dup)]]
- [[_COMMUNITY_Students Table Meta|Students Table Meta]]
- [[_COMMUNITY_Shared tsconfig Compiler Options|Shared tsconfig Compiler Options]]
- [[_COMMUNITY_Shared Package Manifest|Shared Package Manifest]]
- [[_COMMUNITY_Reservation Schema & Enums|Reservation Schema & Enums]]
- [[_COMMUNITY_User Profile Zod Schemas|User Profile Zod Schemas]]
- [[_COMMUNITY_Root Workspace Dev Dependencies|Root Workspace Dev Dependencies]]
- [[_COMMUNITY_API tsconfig Compiler Options|API tsconfig Compiler Options]]
- [[_COMMUNITY_Drizzle Table Skeleton A|Drizzle Table Skeleton A]]
- [[_COMMUNITY_Auth Zod Schemas|Auth Zod Schemas]]
- [[_COMMUNITY_Listing Zod Schemas|Listing Zod Schemas]]
- [[_COMMUNITY_Properties Columns Subset|Properties Columns Subset]]
- [[_COMMUNITY_Verification Token Columns|Verification Token Columns]]
- [[_COMMUNITY_Session IPUser-Agent Columns|Session IP/User-Agent Columns]]
- [[_COMMUNITY_Session IPUser-Agent Columns (dup)|Session IP/User-Agent Columns (dup)]]
- [[_COMMUNITY_Student Profile Columns|Student Profile Columns]]
- [[_COMMUNITY_NestJS Bootstrap (mainenvhealth)|NestJS Bootstrap (main/env/health)]]
- [[_COMMUNITY_Property Zod Schemas|Property Zod Schemas]]
- [[_COMMUNITY_RLS Test Helpers|RLS Test Helpers]]
- [[_COMMUNITY_Enum Column Type A|Enum Column Type A]]
- [[_COMMUNITY_Enum Column Type B|Enum Column Type B]]
- [[_COMMUNITY_Enum Column Type C|Enum Column Type C]]
- [[_COMMUNITY_Nest CLI Config|Nest CLI Config]]
- [[_COMMUNITY_created_at Column Pattern A|created_at Column Pattern A]]
- [[_COMMUNITY_created_at Column Pattern B|created_at Column Pattern B]]
- [[_COMMUNITY_University Enum Column|University Enum Column]]
- [[_COMMUNITY_used_at Column Pattern|used_at Column Pattern]]
- [[_COMMUNITY_API tsconfig File|API tsconfig File]]
- [[_COMMUNITY_RLS Migration & Reputation View|RLS Migration & Reputation View]]
- [[_COMMUNITY_gps_lon Column Pattern|gps_lon Column Pattern]]
- [[_COMMUNITY_user_id Column Pattern A|user_id Column Pattern A]]
- [[_COMMUNITY_landlord_id Column Pattern|landlord_id Column Pattern]]
- [[_COMMUNITY_expires_at Column Pattern A|expires_at Column Pattern A]]
- [[_COMMUNITY_expires_at Column Pattern B|expires_at Column Pattern B]]
- [[_COMMUNITY_token_hash Column Pattern|token_hash Column Pattern]]
- [[_COMMUNITY_user_id Column Pattern B|user_id Column Pattern B]]
- [[_COMMUNITY_Config Package Manifest|Config Package Manifest]]
- [[_COMMUNITY_Workspace Package Cross-refs|Workspace Package Cross-refs]]
- [[_COMMUNITY_Migration Journal|Migration Journal]]
- [[_COMMUNITY_Local Claude Settings|Local Claude Settings]]
- [[_COMMUNITY_RLS Context Helper|RLS Context Helper]]
- [[_COMMUNITY_Enum Cross-Reference (Drizzle - Shared)|Enum Cross-Reference (Drizzle <-> Shared)]]
- [[_COMMUNITY_CampusHomes Workspace Root|CampusHomes Workspace Root]]
- [[_COMMUNITY_Nest AppModule|Nest AppModule]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 15 edges
2. `created_at` - 12 edges
3. `created_at` - 12 edges
4. `public.landlords` - 11 edges
5. `public.ops_staff` - 11 edges
6. `public.sessions` - 11 edges
7. `public.students` - 11 edges
8. `public.users` - 11 edges
9. `public.verification_tokens` - 11 edges
10. `public.properties` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Build Memory` --references--> `RLS Hardening Migration`  [EXTRACTED]
  CLAUDE.md → apps/api/migrations/0001_rls_hardening.sql
- `@campushomes/api` --references--> `@campushomes/config`  [EXTRACTED]
  apps/api/package.json → packages/config/package.json
- `@campushomes/api` --references--> `@campushomes/shared`  [EXTRACTED]
  apps/api/package.json → packages/shared/package.json
- `Drizzle Enums` --implements--> `Shared Enums`  [EXTRACTED]
  apps/api/src/db/schema/enums.ts → packages/shared/src/enums.ts
- `Environment Config` --references--> `@campushomes/api`  [INFERRED]
  apps/api/src/config/env.ts → apps/api/package.json

## Communities (69 total, 5 thin omitted)

### Community 0 - "Shared Zod Schema Package"
Cohesion: 0.06
Nodes (52): Db, chatMessages, chatThreads, notifications, notificationTemplates, pushSubscriptions, catchment, docType (+44 more)

### Community 1 - "Properties Table Columns"
Cohesion: 0.05
Nodes (43): gps_lat, gps_lon, id, landlord_id, name, status, street_address, name (+35 more)

### Community 2 - "Users Table Columns"
Cohesion: 0.05
Nodes (41): email, phone, role, updated_at, name, notNull, primaryKey, type (+33 more)

### Community 3 - "Users Table Columns (dup)"
Cohesion: 0.05
Nodes (41): email, phone, role, updated_at, name, notNull, primaryKey, type (+33 more)

### Community 4 - "API package.json Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, @campushomes/shared, drizzle-orm, @nestjs/common, @nestjs/core, @nestjs/platform-express, nestjs-zod, pg (+30 more)

### Community 5 - "Property Documents Columns"
Cohesion: 0.05
Nodes (38): doc_type, property_id, storage_key, uploaded_at, uploaded_by, verified_at, verified_by, name (+30 more)

### Community 6 - "Drizzle Column Metadata A"
Cohesion: 0.05
Nodes (38): default, name, notNull, primaryKey, type, default, name, notNull (+30 more)

### Community 7 - "Drizzle Column Metadata B"
Cohesion: 0.05
Nodes (38): default, name, notNull, primaryKey, type, default, name, notNull (+30 more)

### Community 8 - "Property Documents Columns (dup)"
Cohesion: 0.05
Nodes (38): doc_type, property_id, storage_key, uploaded_at, uploaded_by, verified_at, verified_by, name (+30 more)

### Community 9 - "Migration 0000 Snapshot"
Cohesion: 0.06
Nodes (35): dialect, properties_landlord_id_landlords_user_id_fk, id, prevId, columnsFrom, columnsTo, name, onDelete (+27 more)

### Community 10 - "Students Table Columns"
Cohesion: 0.06
Nodes (35): national_id_hash, university, year_of_study, students_user_id_users_id_fk, name, notNull, primaryKey, type (+27 more)

### Community 11 - "Landlords Table Columns"
Cohesion: 0.06
Nodes (33): id_doc_storage_key, kyc_reviewed_at, kyc_reviewed_by, kyc_status, legal_name, phone_verified_at, name, notNull (+25 more)

### Community 12 - "Landlords Table Columns (dup)"
Cohesion: 0.06
Nodes (33): id_doc_storage_key, kyc_reviewed_at, kyc_reviewed_by, kyc_status, legal_name, phone_verified_at, name, notNull (+25 more)

### Community 13 - "Migration 0001 Snapshot"
Cohesion: 0.06
Nodes (32): dialect, properties_landlord_id_landlords_user_id_fk, id, prevId, columnsFrom, columnsTo, name, onDelete (+24 more)

### Community 14 - "Landlords Foreign Keys"
Cohesion: 0.08
Nodes (26): landlords_kyc_reviewed_by_users_id_fk, landlords_user_id_users_id_fk, columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom (+18 more)

### Community 15 - "Landlords Foreign Keys (dup)"
Cohesion: 0.08
Nodes (26): landlords_kyc_reviewed_by_users_id_fk, landlords_user_id_users_id_fk, columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom (+18 more)

### Community 16 - "Property Documents Foreign Keys"
Cohesion: 0.08
Nodes (25): property_documents_property_id_properties_id_fk, property_documents_uploaded_by_users_id_fk, property_documents_verified_by_ops_staff_user_id_fk, columnsFrom, columnsTo, name, onDelete, onUpdate (+17 more)

### Community 17 - "Property Documents Foreign Keys (dup)"
Cohesion: 0.08
Nodes (25): property_documents_property_id_properties_id_fk, property_documents_uploaded_by_users_id_fk, property_documents_verified_by_ops_staff_user_id_fk, columnsFrom, columnsTo, name, onDelete, onUpdate (+17 more)

### Community 18 - "Shared Enum Definitions"
Cohesion: 0.10
Nodes (20): KycStatus, ListingStatus, MOVE_IN_CONFIRMER_ROLES, NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, PAYMENT_METHODS, PAYMENT_PROVIDERS, PaymentStatus (+12 more)

### Community 19 - "Verification Tokens Table Meta"
Cohesion: 0.11
Nodes (18): verification_tokens_user_id_users_id_fk, checkConstraints, compositePrimaryKeys, foreignKeys, indexes, isRLSEnabled, name, policies (+10 more)

### Community 20 - "Sessions Table Meta"
Cohesion: 0.11
Nodes (18): sessions_user_id_users_id_fk, checkConstraints, compositePrimaryKeys, foreignKeys, indexes, isRLSEnabled, name, policies (+10 more)

### Community 21 - "Verification Tokens Table Meta (dup)"
Cohesion: 0.11
Nodes (18): verification_tokens_user_id_users_id_fk, checkConstraints, compositePrimaryKeys, foreignKeys, indexes, isRLSEnabled, name, policies (+10 more)

### Community 22 - "Sessions Table Meta (dup)"
Cohesion: 0.11
Nodes (18): sessions_user_id_users_id_fk, checkConstraints, compositePrimaryKeys, foreignKeys, indexes, isRLSEnabled, name, policies (+10 more)

### Community 23 - "Students Table Meta"
Cohesion: 0.11
Nodes (18): students_user_id_users_id_fk, checkConstraints, compositePrimaryKeys, foreignKeys, indexes, isRLSEnabled, name, policies (+10 more)

### Community 24 - "Shared tsconfig Compiler Options"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, lib, module, moduleResolution (+7 more)

### Community 25 - "Shared Package Manifest"
Cohesion: 0.12
Nodes (15): dependencies, zod, devDependencies, @campushomes/config, typescript, main, name, private (+7 more)

### Community 26 - "Reservation Schema & Enums"
Cohesion: 0.16
Nodes (13): idempotencyKey, ugxAmount, uuid, PAYMENT_STATUSES, RESERVATION_STATUSES, CreateHoldInput, createHoldSchema, LandlordReservationView (+5 more)

### Community 27 - "User Profile Zod Schemas"
Cohesion: 0.13
Nodes (14): CATCHMENTS, KYC_STATUSES, OPS_TEAMS, UNIVERSITIES, CreateLandlordProfileInput, createLandlordProfileSchema, CreateStudentProfileInput, createStudentProfileSchema (+6 more)

### Community 28 - "Root Workspace Dev Dependencies"
Cohesion: 0.15
Nodes (12): devDependencies, eslint, typescript-eslint, engines, node, name, packageManager, private (+4 more)

### Community 29 - "API tsconfig Compiler Options"
Cohesion: 0.17
Nodes (11): compilerOptions, baseUrl, declaration, emitDecoratorMetadata, experimentalDecorators, module, moduleResolution, outDir (+3 more)

### Community 30 - "Drizzle Table Skeleton A"
Cohesion: 0.17
Nodes (12): id, name, default, name, notNull, primaryKey, type, name (+4 more)

### Community 31 - "Auth Zod Schemas"
Cohesion: 0.17
Nodes (11): EmailLoginInput, emailLoginSchema, RequestOtpInput, requestOtpSchema, SessionUser, sessionUserSchema, VerifyOtpInput, verifyOtpSchema (+3 more)

### Community 32 - "Listing Zod Schemas"
Cohesion: 0.17
Nodes (11): LISTING_STATUSES, VERIFICATION_CHECKLIST_COMPONENTS, checklistComponentResultSchema, Listing, listingSchema, ListingSearchInput, listingSearchSchema, ListingVersion (+3 more)

### Community 33 - "Properties Columns Subset"
Cohesion: 0.18
Nodes (11): gps_lat, street_address, name, notNull, primaryKey, type, columns, name (+3 more)

### Community 34 - "Verification Token Columns"
Cohesion: 0.18
Nodes (11): token_hash, used_at, columns, name, notNull, primaryKey, type, name (+3 more)

### Community 35 - "Session IP/User-Agent Columns"
Cohesion: 0.18
Nodes (11): ip_address, user_agent, name, notNull, primaryKey, type, columns, name (+3 more)

### Community 36 - "Session IP/User-Agent Columns (dup)"
Cohesion: 0.18
Nodes (11): ip_address, user_agent, name, notNull, primaryKey, type, columns, name (+3 more)

### Community 37 - "Student Profile Columns"
Cohesion: 0.18
Nodes (11): national_id_hash, year_of_study, name, notNull, primaryKey, type, columns, name (+3 more)

### Community 38 - "NestJS Bootstrap (main/env/health)"
Cohesion: 0.25
Nodes (6): Env, envSchema, loadEnv(), HealthController, AppModule, bootstrap()

### Community 39 - "Property Zod Schemas"
Cohesion: 0.20
Nodes (9): DOC_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES, Property, PropertyDocument, propertyDocumentSchema, propertySchema, SubmitPropertyInput (+1 more)

### Community 40 - "RLS Test Helpers"
Cohesion: 0.39
Nodes (6): asIdentity(), pool, seed(), TestIdentity, FULL_CHECKLIST, seedUser()

### Community 41 - "Enum Column Type A"
Cohesion: 0.29
Nodes (7): status, default, name, notNull, primaryKey, type, typeSchema

### Community 42 - "Enum Column Type B"
Cohesion: 0.29
Nodes (7): type, default, name, notNull, primaryKey, type, typeSchema

### Community 43 - "Enum Column Type C"
Cohesion: 0.29
Nodes (7): type, default, name, notNull, primaryKey, type, typeSchema

### Community 44 - "Nest CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 45 - "created_at Column Pattern A"
Cohesion: 0.33
Nodes (6): created_at, default, name, notNull, primaryKey, type

### Community 46 - "created_at Column Pattern B"
Cohesion: 0.33
Nodes (6): created_at, default, name, notNull, primaryKey, type

### Community 47 - "University Enum Column"
Cohesion: 0.33
Nodes (6): university, name, notNull, primaryKey, type, typeSchema

### Community 48 - "used_at Column Pattern"
Cohesion: 0.33
Nodes (6): used_at, columns, name, notNull, primaryKey, type

### Community 49 - "API tsconfig File"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 50 - "RLS Migration & Reputation View"
Cohesion: 0.40
Nodes (5): Build Memory, reputation_scores, withRlsContext, RLS Hardening Migration, RLS Proof Tests

### Community 51 - "gps_lon Column Pattern"
Cohesion: 0.40
Nodes (5): gps_lon, name, notNull, primaryKey, type

### Community 52 - "user_id Column Pattern A"
Cohesion: 0.40
Nodes (5): user_id, name, notNull, primaryKey, type

### Community 53 - "landlord_id Column Pattern"
Cohesion: 0.40
Nodes (5): landlord_id, name, notNull, primaryKey, type

### Community 54 - "expires_at Column Pattern A"
Cohesion: 0.40
Nodes (5): expires_at, name, notNull, primaryKey, type

### Community 55 - "expires_at Column Pattern B"
Cohesion: 0.40
Nodes (5): expires_at, name, notNull, primaryKey, type

### Community 56 - "token_hash Column Pattern"
Cohesion: 0.40
Nodes (5): token_hash, name, notNull, primaryKey, type

### Community 57 - "user_id Column Pattern B"
Cohesion: 0.40
Nodes (5): user_id, name, notNull, primaryKey, type

### Community 58 - "Config Package Manifest"
Cohesion: 0.40
Nodes (4): files, name, private, version

### Community 59 - "Workspace Package Cross-refs"
Cohesion: 0.50
Nodes (4): @campushomes/api, @campushomes/config, Environment Config, @campushomes/shared

### Community 60 - "Migration Journal"
Cohesion: 0.50
Nodes (3): dialect, entries, version

## Knowledge Gaps
- **822 isolated node(s):** `name`, `private`, `packageManager`, `node`, `lint` (+817 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `tables` connect `Migration 0000 Snapshot` to `Users Table Columns`, `Drizzle Column Metadata A`, `Students Table Columns`, `Landlords Foreign Keys`, `Verification Tokens Table Meta`, `Sessions Table Meta`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `tables` connect `Migration 0001 Snapshot` to `Properties Table Columns`, `Users Table Columns (dup)`, `Drizzle Column Metadata B`, `Landlords Foreign Keys (dup)`, `Verification Tokens Table Meta (dup)`, `Sessions Table Meta (dup)`, `Students Table Meta`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `columns` connect `Landlords Table Columns` to `user_id Column Pattern A`, `created_at Column Pattern A`, `Landlords Foreign Keys`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `name`, `private`, `packageManager` to the rest of the system?**
  _822 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shared Zod Schema Package` be split into smaller, more focused modules?**
  _Cohesion score 0.06246799795186892 - nodes in this community are weakly interconnected._
- **Should `Properties Table Columns` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `Users Table Columns` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._