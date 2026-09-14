-- Deleting a user is now a one-step hard delete (AdminUsersService.deleteUser)
-- and no longer requires a fresh MFA sign-in / step-up. Drop step-up from both
-- the delete and purge permissions. Role- and permission-change permissions
-- keep their step-up requirement.
UPDATE permissions SET requires_step_up = false WHERE key IN ('users.delete', 'users.purge');
