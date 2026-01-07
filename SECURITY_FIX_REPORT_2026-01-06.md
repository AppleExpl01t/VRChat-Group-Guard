# SECURITY FIX REPORT - VRChat Group Guard

## Date: 2026-01-06

## Status: ✅ RESOLVED

---

## Executive Summary

A **CRITICAL SECURITY VULNERABILITY** was identified where the application could perform moderation actions (ban, kick, unban, invite, role management) on VRChat groups where the logged-in user **DID NOT HAVE** moderation permissions.

**Severity: CRITICAL (Trust & Security Violation)**
**Resolution: COMPLETE**

---

## Root Cause Analysis

### Primary Issue: Missing `setAllowedGroups` Method

**Location:** `electron\services\InstanceLoggerService.ts`

The `InstanceLoggerService` class had a property `allowedGroupIds: Set<string> | null` but **NEVER DEFINED** the `setAllowedGroups()` method. When `GroupService.ts` tried to call this method, it failed silently in a try-catch block.

**Result:** The `allowedGroupIds` set was NEVER populated, meaning NO group validation occurred anywhere.

### Secondary Issue: No Validation in IPC Handlers

All group-related IPC handlers accepted `groupId` parameters directly from the frontend without any backend validation against the user's actual permissions.

### Tertiary Issue: AutoMod Extracted GroupId from Location

AutoMod extracted the `groupId` from the VRChat instance location string via regex matching. If the user was in ANY group instance (even one they don't moderate), AutoMod would attempt to execute ban actions on that group.

---

## Affected Handlers (Before Fix)

| Service         | Handler                      | Risk Level   |
| --------------- | ---------------------------- | ------------ |
| GroupService    | `groups:get-details`         | Medium       |
| GroupService    | `groups:get-members`         | Medium       |
| GroupService    | `groups:search-members`      | Medium       |
| GroupService    | `groups:get-requests`        | Medium       |
| GroupService    | `groups:get-bans`            | Medium       |
| GroupService    | `groups:get-audit-logs`      | Medium       |
| GroupService    | `groups:get-instances`       | Medium       |
| GroupService    | `groups:ban-user`            | **CRITICAL** |
| GroupService    | `groups:get-roles`           | Medium       |
| GroupService    | `groups:add-member-role`     | **HIGH**     |
| GroupService    | `groups:remove-member-role`  | **HIGH**     |
| GroupService    | `groups:respond-request`     | **HIGH**     |
| InstanceService | `instance:recruit-user`      | **HIGH**     |
| InstanceService | `instance:unban-user`        | **HIGH**     |
| InstanceService | `instance:kick-user`         | **CRITICAL** |
| InstanceService | `instance:get-rally-targets` | Medium       |
| AutoModService  | `executeAction()`            | **CRITICAL** |
| AutoModService  | `runAutoModCycle()`          | **CRITICAL** |
| AutoModService  | `player-joined` event        | **CRITICAL** |

---

## Solution Implemented

### 1. Created GroupAuthorizationService (NEW FILE)

**File:** `electron\services\GroupAuthorizationService.ts`

A centralized security service that:

- Maintains a runtime cache of allowed group IDs
- Provides `validateAccess(groupId, action)` - throws on unauthorized access
- Provides `validateAccessSafe(groupId, action)` - returns result object
- Provides `isGroupAllowed(groupId)` - simple boolean check
- Provides `setAllowedGroups(groupIds[])` - called when user fetches their groups
- Provides `clearAllowedGroups()` - called on logout
- Logs all security violations for audit trail

```typescript
// Usage example:
groupAuthorizationService.validateAccess(groupId, "groups:ban-user");
// Throws: "[SECURITY] Access Denied: User does not have moderation permissions for group: grp_xxx"
```

### 2. Implemented `setAllowedGroups` in InstanceLoggerService

**File:** `electron\services\InstanceLoggerService.ts`

Added the missing method that:

- Populates the local `allowedGroupIds` set
- Synchronizes with the central `GroupAuthorizationService`

### 3. Added Validation to ALL GroupService Handlers

**File:** `electron\services\GroupService.ts`

Every handler that accepts a `groupId` parameter now calls:

```typescript
groupAuthorizationService.validateAccess(groupId, "handler-name");
// or
const authCheck = groupAuthorizationService.validateAccessSafe(
  groupId,
  "handler-name"
);
if (!authCheck.allowed) {
  return { success: false, error: authCheck.error };
}
```

### 4. Added Validation to ALL InstanceService Handlers

**File:** `electron\services\InstanceService.ts`

All handlers that take a `groupId` parameter now validate before processing:

- `instance:recruit-user`
- `instance:unban-user`
- `instance:kick-user`
- `instance:get-rally-targets`

### 5. Added Validation to AutoModService

**File:** `electron\services\AutoModService.ts`

Critical security checks added to:

- `executeAction()` - Validates groupId BEFORE attempting any ban action
- `runAutoModCycle()` - Validates groupId BEFORE processing players
- `player-joined` event handler - Validates groupId BEFORE checking player

### 6. Added Cleanup on Logout

**File:** `electron\services\AuthService.ts`

On logout, `groupAuthorizationService.clearAllowedGroups()` is called to ensure permissions are reset.

---

## Files Modified

| File                                             | Changes                            |
| ------------------------------------------------ | ---------------------------------- |
| `electron/services/GroupAuthorizationService.ts` | **NEW** - Central security service |
| `electron/services/InstanceLoggerService.ts`     | Added `setAllowedGroups()` method  |
| `electron/services/GroupService.ts`              | Added validation to 12 handlers    |
| `electron/services/InstanceService.ts`           | Added validation to 4 handlers     |
| `electron/services/AutoModService.ts`            | Added validation to 3 functions    |
| `electron/services/AuthService.ts`               | Added logout cleanup               |

---

## Security Architecture (After Fix)

```
┌─────────────────────────────────────────────────────────────┐
│  User Login                                                  │
│    ↓                                                         │
│  groups:get-my-groups → VRChat API → Filter moderatable     │
│    ↓                                                         │
│  GroupAuthorizationService.setAllowedGroups([grp_a, grp_b])  │
│    ↓                                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Any Group Action Request (e.g., groups:ban-user)           │
│    ↓                                                         │
│  GroupAuthorizationService.validateAccess(groupId, action)   │
│    │                                                         │
│    ├── groupId in allowedGroupIds? → ALLOW → Proceed        │
│    │                                                         │
│    └── groupId NOT in allowedGroupIds?                       │
│          ↓                                                   │
│        LOG VIOLATION                                         │
│          ↓                                                   │
│        THROW ERROR / RETURN REJECTION                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  User Logout                                                 │
│    ↓                                                         │
│  GroupAuthorizationService.clearAllowedGroups()              │
│    ↓                                                         │
│  allowedGroupIds = empty set                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Future Protection Measures

1. **Defense in Depth**: Every new handler that accepts a `groupId` MUST call `groupAuthorizationService.validateAccess()` before any group operation.

2. **Audit Trail**: All authorization failures are logged with timestamp, groupId, action, and reason.

3. **Centralized Enforcement**: The single `GroupAuthorizationService` makes it easy to audit and ensure consistent security across all features.

4. **Fail-Secure Design**: If `allowedGroupIds` is empty or uninitialized, ALL group actions are rejected.

---

## Verification Checklist

- [x] TypeScript compiles without errors
- [x] All banGroupMember calls are in protected handlers
- [x] All unbanGroupMember calls are in protected handlers
- [x] All createGroupInvite calls are in protected handlers
- [x] All getGroupMembers calls are in protected handlers
- [x] AutoMod validateAccess before executeAction
- [x] AutoMod validateAccess before runAutoModCycle
- [x] AutoMod validateAccess on player-joined event
- [x] Logout clears allowed groups
- [x] InstanceLoggerService.setAllowedGroups() now exists

---

## Conclusion

The critical security vulnerability has been **COMPLETELY RESOLVED**. The application now enforces that **ONLY groups where the user has verified moderation permissions** can be accessed through any moderation action.

This fix is:

- **Robust**: Centralized validation ensures consistent enforcement
- **Comprehensive**: All 19 affected handlers/functions are now protected
- **Future-proof**: New features MUST use the GroupAuthorizationService
- **Auditable**: All violations are logged for security monitoring
