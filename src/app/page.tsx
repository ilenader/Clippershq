import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevBypassEnabled, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import { cookies } from "next/headers";
import { ClipperLanding } from "./clipper-landing";

export default async function LandingPage() {
  if (isDevBypassEnabled()) {
    const cookieStore = await cookies();
    const devRole = cookieStore.get(DEV_AUTH_COOKIE)?.value;
    if (devRole) {
      if (devRole === "ADMIN" || devRole === "OWNER") redirect("/admin");
      redirect("/dashboard");
    }
    redirect("/dev-login");
  }
  const session = await auth();
  if (session?.user) {
    const role = (session.user as any).role;
    if (role === "ADMIN" || role === "OWNER") redirect("/admin");
    redirect("/dashboard");
  }

  return <ClipperLanding />;
}
