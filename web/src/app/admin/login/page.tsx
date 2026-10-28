import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  redirect("/entrar?admin=1");
}
