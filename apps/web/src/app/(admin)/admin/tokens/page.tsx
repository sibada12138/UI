import { redirect } from "next/navigation";

export default function LegacyTokensPage() {
  redirect("/admin/todo");
}
