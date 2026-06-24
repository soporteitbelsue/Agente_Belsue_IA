import { redirect } from "next/navigation";

// El middleware deriva "/" según la sesión; esto es solo un fallback.
export default function Home() {
  redirect("/login");
}
