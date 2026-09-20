export type AppRole = 'admin' | 'member';
export type AccountStatus = 'pending' | 'active' | 'disabled';

export type UserProfile = {
  id: string;
  email: string;
  google_name: string | null;
  avatar_url: string | null;
  sheet_name: string | null;
  role: AppRole;
  account_status: AccountStatus;
  onboarding_completed: boolean;
  approved_at: string | null;
  last_login_at: string | null;
};
