export interface EmployeeEntity {
  id: number;
  username: string;
  password_hash: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}
