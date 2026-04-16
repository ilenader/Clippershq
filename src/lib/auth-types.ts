export interface SessionUser {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  role: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
  status?: string;
}
