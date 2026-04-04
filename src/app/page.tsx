import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevBypassEnabled, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import { cookies } from "next/headers";

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

  return (
    <iframe
      src="/clipper.html"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
    />
  );
}
