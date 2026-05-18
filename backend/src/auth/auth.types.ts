export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
};

export type JwtUserPayload = {
  sub: string;
  username: string;
  displayName: string;
  category: string;
};
