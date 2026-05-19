export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  factory: string;
  role: string;
};

export type JwtUserPayload = {
  sub: string;
  username: string;
  displayName: string;
  category: string;
  factory: string;
  role: string;
  tokenType?: 'access' | 'refresh';
};
