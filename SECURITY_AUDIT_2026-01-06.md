# CRITICAL SECURITY AUDIT - VRChat Group Guard

## Date: 2026-01-06

## Status: ✅ RESOLVED - See SECURITY_FIX_REPORT_2026-01-06.md

---

## Executive Summary

A **CRITICAL SECURITY VULNERABILITY** has been identified that allows the application to perform moderation actions (ban, kick, unban, invite, role management) on VRChat groups where the user **DOES NOT HAVE** moderation permissions.

**Severity: CRITICAL (Trust & Security Violation)**

---

## Root Cause Analysis

### Primary Issue: Missing `setAllowedGroups` Method

**Location:** `electron\services\InstanceLoggerService.ts`

The `InstanceLoggerService` class has a property `allowedGroupIds: Set<string> | null` (line 15) but **NEVER DEFINES** the `setAllowedGroups()` method that is supposed to populate it.

**Evidence:**

```typescript
// GroupService.ts line 80 - This call FAILS SILENTLY
instanceLoggerService.setAllowedGroups(mappedGroups.map((g) => g.id));
```

The call is wrapped in a try-catch (lines 77-83) that catches the error but doesn't prevent the application from continuing. Since `allowedGroupIds` is never set, it remains `null`.

### Secondary Issue: No Validation in IPC Handlers

**All group-related IPC handlers accept `groupId` without validation:**

| Service         | Handler                      | Line | Validates? |
| --------------- | ---------------------------- | ---- | ---------- |
| GroupService    | `groups:get-details`         | 96   | ❌ NO      |
| GroupService    | `groups:get-members`         | 134  | ❌ NO      |
| GroupService    | `groups:search-members`      | 167  | ❌ NO      |
| GroupService    | `groups:get-requests`        | 244  | ❌ NO      |
| GroupService    | `groups:respond-request`     | 755+ | ❌ NO      |
| GroupService    | `groups:get-bans`            | 273  | ❌ NO      |
| GroupService    | `groups:get-instances`       | 383+ | ❌ NO      |
| GroupService    | `groups:ban-user`            | 511  | ❌ NO      |
| GroupService    | `groups:get-roles`           | 543  | ❌ NO      |
| GroupService    | `groups:add-member-role`     | 616+ | ❌ NO      |
| GroupService    | `groups:remove-member-role`  | 679+ | ❌ NO      |
| InstanceService | `instance:recruit-user`      | 239  | ❌ NO      |
| InstanceService | `instance:unban-user`        | 283  | ❌ NO      |
| InstanceService | `instance:kick-user`         | 314  | ❌ NO      |
| InstanceService | `instance:get-rally-targets` | 342  | ❌ NO      |
| AutoModService  | `executeAction()`            | 159  | ❌ NO      |

### Tertiary Issue: AutoMod Gets GroupId from Location, Not Allowed List

**Location:** `electron\services\AutoModService.ts` lines 143-157

```typescript
const getCurrentGroupId = (): string | null => {
  const instanceId = instanceLoggerService.getCurrentInstanceId();
  if (!instanceId) return null;

  const match = instanceId.match(/group\((grp_[a-zA-Z0-9-]+)\)/);
  return match ? match[1] : null; // ⚠️ EXTRACTS ANY GROUP ID WITHOUT VALIDATION
};
```

This extracts the groupId from the VRChat instance location string. If the user is in a group instance they don't moderate, AutoMod will attempt to execute actions on that group!

---

## Affected Features

### 1. AutoMod (CRITICAL)

- **File:** `electron\services\AutoModService.ts`
- **Issue:** Bans users from ANY group instance the user joins, regardless of permissions
- **Impact:** Could ban users from groups the app user has no authority over

### 2. Live View - Kick/Ban/Invite Actions

- **File:** `electron\services\InstanceService.ts`
- **Issue:** `recruit-user`, `kick-user`, `unban-user` accept any groupId
- **Impact:** Frontend can pass any group ID

### 3. BanUserDialog - Multi-Group Ban

- **File:** `src\features\live\dialogs\BanUserDialog.tsx`
- **Issue:** Lists `myGroups` from store which IS correctly filtered, but backend doesn't verify
- **Impact:** If store is tampered with, backend would accept invalid group IDs

### 4. MemberSearchWidget - Kick/Ban

- **File:** `src\features\dashboard\widgets\MemberSearchWidget.tsx`
- **Issue:** Passes `selectedGroup.id` to backend without backend validation
- **Impact:** Backend trusts frontend-provided group ID

### 5. MemberRoleDialog - Role Management

- **File:** `src\features\dashboard\dialogs\MemberRoleDialog.tsx`
- **Issue:** `addMemberRole` and `removeMemberRole` accept any groupId
- **Impact:** Could modify roles on unauthorized groups

### 6. RequestsListDialog - Accept/Deny Requests

- **File:** `src\features\dashboard\dialogs\RequestsListDialog.tsx`
- **Issue:** `respondToRequest` accepts any groupId
- **Impact:** Could approve/deny join requests for unauthorized groups

### 7. InstancesListDialog - Close Instance

- **File:** `src\features\dashboard\dialogs\InstancesListDialog.tsx`
- **Issue:** `closeInstance` can be called on any instance
- **Impact:** Lower risk since it requires world/instance ID, not group ID

---

## Remediation Plan

### Phase 1: Create Centralized Group Authorization Service

Create a new `GroupAuthorizationService` that:

1. Maintains a runtime cache of allowed group IDs
2. Provides a `validateGroupAccess(groupId)` method
3. Is called by ALL IPC handlers before executing any group action
4. Returns a standardized rejection response for unauthorized access

### Phase 2: Implement `setAllowedGroups` in InstanceLoggerService

Add the missing method to properly populate the allowed groups set.

### Phase 3: Add Validation to ALL IPC Handlers

Modify every handler in:

- `GroupService.ts`
- `InstanceService.ts`
- `AutoModService.ts`

To call `validateGroupAccess(groupId)` before any API calls.

### Phase 4: Add Validation to Frontend Stores

Add redundant client-side validation (defense in depth) in:

- `groupStore.ts` - Verify group ID before IPC calls

### Phase 5: Add Audit Logging

Log all authorization failures for security monitoring.

---

## Testing Requirements

After remediation:

1. Attempt to perform actions on a group where user has no permissions
2. Verify actions are rejected with appropriate error message
3. Verify AutoMod only operates on authorized groups
4. Verify audit log captures all rejected attempts

---

## Status: ✅ RESOLVED

All issues identified in this audit have been fixed. See **SECURITY_FIX_REPORT_2026-01-06.md** for complete details on the remediation.
