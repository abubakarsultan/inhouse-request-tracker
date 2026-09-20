// LOGIN REMOVED. There is no sign-in, no cookies, no redirect to /login.
// Everyone who opens the site is treated as the admin. These helpers are
// kept (and stay async) only so the rest of the code didn't have to change.

export type CurrentUser = {
  id: string | null; // null: there is no auth user, so created_by / changed_by are stored empty
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'admin' | 'member';
};

const APP_USER: CurrentUser = {
  id: null,
  email: (process.env.ADMIN_EMAIL || 'abubakarsultan@rankviz.com').toLowerCase().trim(),
  name: 'Abubakar Sultan',
  avatar: null,
  role: 'admin',
};

export async function getCurrentUser(): Promise<CurrentUser> {
  return APP_USER;
}

export async function requireUser(): Promise<CurrentUser> {
  return APP_USER;
}

export async function requireAdmin(): Promise<CurrentUser> {
  return APP_USER;
}
