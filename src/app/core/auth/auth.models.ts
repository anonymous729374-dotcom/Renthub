
export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials extends AuthCredentials {
  fullName: string;
}

export type ApplicationRole = 'user' | 'lister' | 'admin';
export type ListerApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: ApplicationRole;
  listerStatus: ListerApplicationStatus;
  isSuspended: boolean;
}
