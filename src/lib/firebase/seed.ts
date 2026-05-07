// ============================================================
// Seed Script — Initializes Roles, Features, Settings, Super Admin
// Run via: seed page or API route
// ============================================================
import {
  collection,
  doc,
  setDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { RoleSlug, FeatureStatus, FeatureCategory, UserStatus } from '@/lib/types';

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

export async function seedFeatures(createdBy: string): Promise<void> {
  const features = [
    {
      name: 'Image Generator',
      slug: 'image-generator',
      description: 'Generate images using AI models. Upload references or describe what you need.',
      route: '/tools/image-generator',
      icon: 'Image',
      category: FeatureCategory.TOOL,
      status: FeatureStatus.ACTIVE,
      isPlaceholder: true,
      supportedInputTypes: ['text_prompt', 'image_upload'],
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
      status: FeatureStatus.ACTIVE,
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
      status: FeatureStatus.ACTIVE,
      isPlaceholder: true,
      supportedInputTypes: ['text_prompt', 'file_upload'],
      toolConfig: null,
      sortOrder: 3,
    },
    {
      name: 'Documentation Q&A',
      slug: 'documentation-qa',
      description: 'Ask questions about internal documentation and get instant AI answers.',
      route: '/tools/documentation-qa',
      icon: 'BookOpen',
      category: FeatureCategory.DOCUMENTATION,
      status: FeatureStatus.COMING_SOON,
      isPlaceholder: true,
      supportedInputTypes: ['text_prompt'],
      toolConfig: null,
      sortOrder: 4,
    },
    {
      name: 'Campaign Assistant',
      slug: 'campaign-assistant',
      description: 'Plan and generate marketing campaign content with AI assistance.',
      route: '/tools/campaign-assistant',
      icon: 'Megaphone',
      category: FeatureCategory.TOOL,
      status: FeatureStatus.COMING_SOON,
      isPlaceholder: true,
      supportedInputTypes: ['text_prompt', 'dropdown'],
      toolConfig: null,
      sortOrder: 5,
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
  const snap = await getDocs(collection(db, 'roles'));
  return snap.size > 0;
}

export async function runSeed(superAdminUid: string, superAdminEmail: string): Promise<void> {
  const alreadySeeded = await checkIfSeeded();
  if (alreadySeeded) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  console.log('Seeding database...');
  const roleIds = await seedRoles();
  console.log('Roles seeded:', roleIds);

  await seedFeatures(superAdminUid);
  console.log('Features seeded');

  await seedSystemSettings();
  console.log('System settings seeded');

  await createSuperAdminUser(superAdminUid, superAdminEmail, roleIds[RoleSlug.SUPER_ADMIN]);
  console.log('Super Admin user created');

  console.log('Seed complete!');
}
