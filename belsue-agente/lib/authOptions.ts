import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import type { UserRole } from "@/types";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 horas (jornada laboral)
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const supabase = supabaseServer();
        const { data: user, error } = await supabase
          .from("users")
          .select("*")
          .eq("email", credentials.email.toLowerCase().trim())
          .maybeSingle();

        // Mensaje genérico: no distinguimos entre email o contraseña.
        if (error || !user || !user.is_active) return null;

        const valid = await bcrypt.compare(
          credentials.password,
          user.password_hash,
        );
        if (!valid) return null;

        // Actualiza last_login (no bloqueante para el login).
        await supabase
          .from("users")
          .update({ last_login: new Date().toISOString() })
          .eq("id", user.id);

        return {
          id: user.id as string,
          name: user.name as string,
          email: user.email as string,
          role: user.role as UserRole,
          department: (user.department as string | null) ?? undefined,
          mustChangePassword: user.must_change_password === true,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.department = user.department;
        token.mustChangePassword = user.mustChangePassword === true;
      }

      // Al cambiar la contraseña, la página llama a update() de useSession
      // para levantar la obligación sin tener que cerrar sesión. Releemos el
      // flag de la base en vez de fiarnos de lo que mande el navegador.
      if (trigger === "update" && token.id) {
        const supabase = supabaseServer();
        const { data } = await supabase
          .from("users")
          .select("must_change_password")
          .eq("id", token.id)
          .maybeSingle();
        if (data) token.mustChangePassword = data.must_change_password === true;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.department = token.department;
        session.user.mustChangePassword = token.mustChangePassword === true;
      }
      return session;
    },
  },
};
