export type PostStatus = 'pending' | 'processing' | 'commenting' | 'success' | 'error' | 'cancelled';

export interface PostStatusItem {
  url: string;
  name: string;
  status: PostStatus;
  message: string;
  postLink?: string;
  doneAt?: string;
}
