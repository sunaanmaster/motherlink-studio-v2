// The only email domain allowed to use Google sign-in. Admins can still
// invite any email address; those users sign up with a password.
export const COMPANY_EMAIL_DOMAIN = 'motherlink.io';

export function isCompanyEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}
