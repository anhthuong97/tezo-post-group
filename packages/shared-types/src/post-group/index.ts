export type PostStatus = 'pending' | 'processing' | 'commenting' | 'success' | 'error' | 'cancelled';

export interface PostStatusItem {
  url: string;
  name: string;
  status: PostStatus;
  message: string;
  postLink?: string;
  doneAt?: string;
}

export interface Group { id: string; name: string; meta: string; url: string; }
export interface Identity { name: string; avatar: string; }
export interface ApiKeys { gemini: string | null; openai: string | null; priority: 'gemini' | 'openai'; }

export interface LoginRequest  { username: string; password: string; }
export interface LoginResponse { success: boolean; username: string; }
export interface MeResponse    { loggedIn: boolean; userId: number; username: string; }

export interface CreatePostRequest {
  groups: Array<{ url: string; name: string }>;
  content: string;
  images?: string[];
  comment?: string;
}
