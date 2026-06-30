export type PostStatus =
  | 'pending'
  | 'uploading'
  | 'writing'
  | 'posting'
  | 'commenting'
  | 'success'
  | 'error'
  | 'cancelled';

export interface PostStatusItem {
  url: string;
  name: string;
  status: PostStatus;
  message: string;
  postLink?: string;
  doneAt?: string;
}
