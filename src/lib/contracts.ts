
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  login42: string | null;
  avatar: string | null;
  campus: string | null;
  coalition: string | null;
  bio: string;
  socials: { label: string; url: string }[];
  lastSeen: string | null;
  isSupport: boolean;
};

export type FeedPost = {
  id: string;
  body: string;
  image: string | null;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  authorId?: string;
  likes: number;
  comments: number;
  liked: boolean;
  author: Pick<
    PublicUser,
    "id" | "name" | "login42" | "avatar" | "campus"
  > & { isSupport?: boolean | null } | null;
};

export type FeedCommentAuthor = {
  id?: string;
  name: string;
  login42?: string | null;
  avatar?: string | null;
  isSupport?: boolean | null;
};

export type FeedComment = {
  id: string;
  body: string;
  kind?: "text" | "sticker";
  edited?: boolean;
  deleted?: boolean;
  replyTo?: {
    id: string;
    body: string;
    name: string;
    senderId: string;
  } | null;
  createdAt?: string;
  author: FeedCommentAuthor | null;
};

export type ApiErrorCode =
  | "unauthorized"
  | "empty"
  | "limit"
  | "duplicate"
  | "not_found"
  | "forbidden"
  | "invalid";

export type ApiError = { error: ApiErrorCode | string; retryAfter?: number };
export type PostsResponse = { posts: FeedPost[] };
export type CommentsResponse = { comments: FeedComment[]; total?: number };
