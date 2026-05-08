// ============================================================
// Permission Utilities — DFD Process 2.0: Authorize / Check Access
// ============================================================
import type { UserProfile, Role, Feature, SystemSettings } from '@/lib/types';
import { RoleSlug, FeatureStatus } from '@/lib/types';

/**
 * Check if user has access to a specific feature
 * Mirrors the DFD Process 2.0 authorization flow
 */
export function hasFeatureAccess(
  user: UserProfile,
  role: Role,
  feature: Feature,
  settings: SystemSettings | null,
): boolean {
  // Feature must be active
  if (feature.status !== FeatureStatus.ACTIVE) return false;

  // Super Admin always has access
  if (role.slug === RoleSlug.SUPER_ADMIN) return true;

  // Role has all feature access (e.g., admin with defaultAdminToolAccess)
  if (role.hasAllFeatureAccess) return true;

  // Check system settings for admin default access
  if (role.slug === RoleSlug.ADMIN && settings?.defaultAdminToolAccess) return true;

  // Check role default feature access
  if (role.defaultFeatureAccess.includes(feature.featureId)) return true;

  // Check user-specific assigned features
  if (user.assignedFeatureIds.includes(feature.featureId)) return true;

  return false;
}

/**
 * Whether a feature should be VISIBLE to the user (e.g. shown as a card on the dashboard
 * or in the sidebar). Coming-soon features are visible but not openable.
 * Inactive features are hidden entirely. Use hasFeatureAccess() to gate the actual click/route.
 */
export function canViewFeature(
  user: UserProfile,
  role: Role,
  feature: Feature,
  settings: SystemSettings | null,
): boolean {
  if (feature.status === FeatureStatus.INACTIVE) return false;

  if (role.slug === RoleSlug.SUPER_ADMIN) return true;
  if (role.hasAllFeatureAccess) return true;
  if (role.slug === RoleSlug.ADMIN && settings?.defaultAdminToolAccess) return true;
  if (role.defaultFeatureAccess.includes(feature.featureId)) return true;
  if (user.assignedFeatureIds.includes(feature.featureId)) return true;

  return false;
}

/**
 * Get all features accessible to a user
 */
export function getAccessibleFeatures(
  user: UserProfile,
  role: Role,
  allFeatures: Feature[],
  settings: SystemSettings | null,
): Feature[] {
  return allFeatures.filter((f) => hasFeatureAccess(user, role, f, settings));
}

// ---- Management Permission Checks ----

export function canManageUsers(role: Role | null): boolean {
  if (!role) return false;
  return role.managementPermissions.canManageUsers;
}

export function canManageRoles(role: Role | null): boolean {
  if (!role) return false;
  return role.managementPermissions.canManageRoles;
}

export function canManageFeatures(role: Role | null): boolean {
  if (!role) return false;
  return role.managementPermissions.canManageFeatures;
}

export function canManageInvitations(role: Role | null): boolean {
  if (!role) return false;
  return role.managementPermissions.canManageInvitations;
}

export function canViewActivityLogs(role: Role | null): boolean {
  if (!role) return false;
  return role.managementPermissions.canViewActivityLogs;
}

export function canManageSettings(role: Role | null): boolean {
  if (!role) return false;
  return role.managementPermissions.canManageSettings;
}

export function isAdmin(role: Role | null): boolean {
  if (!role) return false;
  return role.slug === RoleSlug.SUPER_ADMIN || role.slug === RoleSlug.ADMIN;
}

export function isSuperAdmin(role: Role | null): boolean {
  if (!role) return false;
  return role.slug === RoleSlug.SUPER_ADMIN;
}
