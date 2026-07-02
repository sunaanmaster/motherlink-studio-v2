// ============================================================
// Seed Script — Initializes Roles, Features, Settings, Super Admin
// Idempotent: each collection is checked independently
// ============================================================
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from './config';
import { RoleSlug, FeatureStatus, FeatureCategory, UserStatus } from '@/lib/types';

export interface SeedState {
  rolesSeeded: boolean;
  featuresSeeded: boolean;
  settingsSeeded: boolean;
  superAdminExists: boolean;
}

export async function getSeedState(superAdminUid?: string): Promise<SeedState> {
  const [roles, features, settings, superAdmin] = await Promise.all([
    getDocs(query(collection(db, 'roles'), limit(1))),
    getDocs(query(collection(db, 'features'), limit(1))),
    getDoc(doc(db, 'system_settings', 'global')),
    superAdminUid ? getDoc(doc(db, 'users', superAdminUid)) : Promise.resolve(null),
  ]);

  return {
    rolesSeeded: !roles.empty,
    featuresSeeded: !features.empty,
    settingsSeeded: settings.exists(),
    superAdminExists: !!(superAdmin && superAdmin.exists()),
  };
}

export async function seedRoles(): Promise<Record<string, string>> {
  const rolesData = [
    {
      name: 'Super Admin',
      slug: RoleSlug.SUPER_ADMIN,
      managementPermissions: {
        canManageUsers: true,
        canManageRoles: true,
        canManageFeatures: true,
        canManageInvitations: true,
        canViewActivityLogs: true,
        canManageSettings: true,
      },
      defaultFeatureAccess: [],
      hasAllFeatureAccess: true,
      isSystemRole: true,
    },
    {
      name: 'Admin',
      slug: RoleSlug.ADMIN,
      managementPermissions: {
        canManageUsers: true,
        canManageRoles: false,
        canManageFeatures: false,
        canManageInvitations: true,
        canViewActivityLogs: true,
        canManageSettings: false,
      },
      defaultFeatureAccess: [],
      hasAllFeatureAccess: true,
      isSystemRole: true,
    },
    {
      name: 'Employee',
      slug: RoleSlug.EMPLOYEE,
      managementPermissions: {
        canManageUsers: false,
        canManageRoles: false,
        canManageFeatures: false,
        canManageInvitations: false,
        canViewActivityLogs: false,
        canManageSettings: false,
      },
      defaultFeatureAccess: [],
      hasAllFeatureAccess: false,
      isSystemRole: true,
    },
  ];

  const roleIds: Record<string, string> = {};
  for (const role of rolesData) {
    const ref = doc(collection(db, 'roles'));
    await setDoc(ref, {
      ...role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    roleIds[role.slug] = ref.id;
  }
  return roleIds;
}

export async function getExistingRoleIds(): Promise<Record<string, string>> {
  const snap = await getDocs(collection(db, 'roles'));
  const roleIds: Record<string, string> = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.slug) roleIds[data.slug] = d.id;
  });
  return roleIds;
}

export async function seedFeatures(createdBy: string): Promise<void> {
  const features = [
    {
      name: 'Image Generator',
      slug: 'image-generator',
      description: 'Generate images using AI models. Describe what you need and let AI handle the rest.',
      route: '/tools/image-generator',
      icon: 'Image',
      category: FeatureCategory.TOOL,
      status: FeatureStatus.ACTIVE,
      isPlaceholder: true,
      supportedInputTypes: ['text_prompt'],
      toolConfig: null,
      sortOrder: 1,
    },
    {
      name: 'Writing Assistant',
      slug: 'writing-assistant',
      description: 'AI-powered writing tool for content creation, editing, and brainstorming.',
      route: '/tools/writing-assistant',
      icon: 'PenTool',
      category: FeatureCategory.TOOL,
      status: FeatureStatus.COMING_SOON,
      isPlaceholder: true,
      supportedInputTypes: ['text_prompt'],
      toolConfig: null,
      sortOrder: 2,
    },
    {
      name: 'SEO Assistant',
      slug: 'seo-assistant',
      description: 'Optimize content for search engines with AI-driven SEO recommendations.',
      route: '/tools/seo-assistant',
      icon: 'Search',
      category: FeatureCategory.TOOL,
      status: FeatureStatus.COMING_SOON,
      isPlaceholder: true,
      supportedInputTypes: ['text_prompt', 'file_upload'],
      toolConfig: null,
      sortOrder: 3,
    },
    {
      name: 'Reddit Visibility',
      slug: 'reddit-visibility',
      description: 'Find high-value Reddit discussions and draft expert replies grounded in client knowledge.',
      route: '/apps/reddit-visibility',
      icon: 'MessageSquare',
      category: FeatureCategory.TOOL,
      status: FeatureStatus.ACTIVE,
      isPlaceholder: false,
      openInNewTab: true,
      supportedInputTypes: ['text_prompt', 'url'],
      toolConfig: null,
      sortOrder: 4,
    },
  ];

  for (const feature of features) {
    const ref = doc(collection(db, 'features'));
    await setDoc(ref, {
      ...feature,
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function seedSystemSettings(): Promise<void> {
  await setDoc(doc(db, 'system_settings', 'global'), {
    defaultAdminToolAccess: true,
    defaultEmployeeAccess: [],
    invitationExpiryDays: 7,
    allowMultiUseInvites: false,
    platformName: 'Motherlink.io',
    platformLogoUrl: null,
    maintenanceMode: false,
    maxToolsPerEmployee: null,
    enableActivityLogging: true,
    enableEmployeeActivityView: true,
    updatedAt: serverTimestamp(),
    updatedBy: 'system',
  });
}

export async function createSuperAdminUser(uid: string, email: string, roleId: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    uid,
    email,
    displayName: 'Super Admin',
    avatarUrl: null,
    roleId,
    roleSlug: RoleSlug.SUPER_ADMIN,
    assignedFeatureIds: [],
    status: UserStatus.ACTIVE,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: null,
    invitedBy: null,
    invitationId: null,
  });
}

export async function checkIfSeeded(): Promise<boolean> {
  const state = await getSeedState();
  return state.rolesSeeded && state.featuresSeeded && state.settingsSeeded;
}

/**
 * Idempotent seeder. Skips collections that are already populated.
 * If superAdminUid is provided, also creates the user profile (only if missing).
 */
export async function runSeed(superAdminUid: string, superAdminEmail: string): Promise<{ seeded: string[]; skipped: string[] }> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  const state = await getSeedState(superAdminUid);

  let roleIds: Record<string, string>;
  if (!state.rolesSeeded) {
    roleIds = await seedRoles();
    seeded.push('roles');
  } else {
    roleIds = await getExistingRoleIds();
    skipped.push('roles');
  }

  if (!state.featuresSeeded) {
    await seedFeatures(superAdminUid);
    seeded.push('features');
  } else {
    skipped.push('features');
  }

  if (!state.settingsSeeded) {
    await seedSystemSettings();
    seeded.push('settings');
  } else {
    skipped.push('settings');
  }

  if (!state.superAdminExists && roleIds[RoleSlug.SUPER_ADMIN]) {
    await createSuperAdminUser(superAdminUid, superAdminEmail, roleIds[RoleSlug.SUPER_ADMIN]);
    seeded.push('super-admin user');
  } else if (state.superAdminExists) {
    skipped.push('super-admin user');
  }

  return { seeded, skipped };
}
