// ============================================================
// Motherlink.io — TypeScript Type Definitions
// Maps to all Firestore collections from the DFD/Schema
// ============================================================

// ---- Enums ----

export enum RoleSlug {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  EMPLOYEE = 'employee',
}

export enum UserStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum FeatureStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  COMING_SOON = 'coming_soon',
}

export enum FeatureCategory {
  TOOL = 'tool',
  DOCUMENTATION = 'documentation',
  WORKFLOW = 'workflow',
}

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export enum LogSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

// ---- Activity Log Action Types ----

export enum LogAction {
  // Auth
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_LOGIN_FAILED = 'user.login_failed',
  // Invitation
  INVITATION_CREATED = 'invitation.created',
  INVITATION_ACCEPTED = 'invitation.accepted',
  INVITATION_REVOKED = 'invitation.revoked',
  INVITATION_EXPIRED = 'invitation.expired',
  // User Management
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_SUSPENDED = 'user.suspended',
  USER_DELETED = 'user.deleted',
  USER_ROLE_CHANGED = 'user.role_changed',
  // Feature Management
  FEATURE_CREATED = 'feature.created',
  FEATURE_UPDATED = 'feature.updated',
  FEATURE_ENABLED = 'feature.enabled',
  FEATURE_DISABLED = 'feature.disabled',
  // Access
  ACCESS_GRANTED = 'access.granted',
  ACCESS_REVOKED = 'access.revoked',
  ACCESS_DENIED = 'access.denied',
  // Tool
  TOOL_OPENED = 'tool.opened',
  TOOL_USED = 'tool.used',
  // Reddit Visibility
  REDDIT_PROJECT_CREATED = 'reddit.project_created',
  REDDIT_PROJECT_UPDATED = 'reddit.project_updated',
  REDDIT_PROJECT_DELETED = 'reddit.project_deleted',
  REDDIT_HISTORY_CLEANED = 'reddit.history_cleaned',
  REDDIT_SOURCE_ADDED = 'reddit.source_added',
  REDDIT_POSTS_FETCHED = 'reddit.posts_fetched',
  REDDIT_POST_ANALYZED = 'reddit.post_analyzed',
  REDDIT_DRAFT_GENERATED = 'reddit.draft_generated',
  REDDIT_DRAFT_POSTED = 'reddit.draft_posted',
  // Settings
  SETTINGS_UPDATED = 'settings.updated',
  // Security
  SECURITY_UNAUTHORIZED = 'security.unauthorized_access',
  SECURITY_VIOLATION = 'security.rule_violation',
}

// ---- Collection Types ----

// D1: users collection
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  roleId: string;
  roleSlug: RoleSlug;
  assignedFeatureIds: string[];
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  invitedBy: string | null;
  invitationId: string | null;
}

// D2: roles collection
export interface ManagementPermissions {
  canManageUsers: boolean;
  canManageRoles: boolean;
  canManageFeatures: boolean;
  canManageInvitations: boolean;
  canViewActivityLogs: boolean;
  canManageSettings: boolean;
}

export interface Role {
  roleId: string;
  name: string;
  slug: RoleSlug;
  managementPermissions: ManagementPermissions;
  defaultFeatureAccess: string[];
  hasAllFeatureAccess: boolean;
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// D3: features collection
export interface ToolConfig {
  maxUsagePerDay: number | null;
  requiresApproval: boolean;
  aiProvider: string | null;
}

export interface Feature {
  featureId: string;
  name: string;
  slug: string;
  description: string;
  route: string;
  icon: string;
  category: FeatureCategory;
  status: FeatureStatus;
  isPlaceholder: boolean;
  openInNewTab?: boolean;
  supportedInputTypes: string[];
  toolConfig: ToolConfig | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// D4: invitations collection
export interface Invitation {
  invitationId: string;
  email: string;
  roleSlug: RoleSlug;
  roleId: string;
  assignedFeatureIds: string[];
  token: string;
  inviteType: 'single_use' | 'multi_use';
  status: InvitationStatus;
  expiresAt: Date;
  invitedBy: string;
  invitedByName: string;
  acceptedBy: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

// D5: activity_logs collection
export interface ActivityLog {
  logId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: LogAction;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown>;
  severity: LogSeverity;
  createdAt: Date;
}

// D6: system_settings collection
export interface SystemSettings {
  defaultAdminToolAccess: boolean;
  defaultEmployeeAccess: string[];
  invitationExpiryDays: number;
  allowMultiUseInvites: boolean;
  platformName: string;
  platformLogoUrl: string | null;
  maintenanceMode: boolean;
  maxToolsPerEmployee: number | null;
  enableActivityLogging: boolean;
  enableEmployeeActivityView: boolean;
  updatedAt: Date;
  updatedBy: string;
}

// ---- Auth Context Types ----

export interface AuthContextType {
  firebaseUser: import('firebase/auth').User | null;
  userProfile: UserProfile | null;
  userRole: Role | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}
