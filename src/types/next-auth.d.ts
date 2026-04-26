import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role: string;
      status: string;
      discordId?: string | null;
    };
  }

  interface User {
    role?: string;
    status?: string;
    discordId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    role?: string;
    status?: string;
    discordId?: string | null;
    email?: string | null;
    name?: string | null;
    lastRefreshAt?: number;
  }
}
