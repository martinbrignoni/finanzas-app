import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { theme as C } from "../../styles/theme";
import { Field, TextInput, PrimaryButton } from "../../components/ui";
import { supabase } from "../../lib/supabaseClient";

/**
 * Envuelve la app: mientras no haya sesión de Supabase, muestra un login de
 * email/contraseña. Los usuarios se crean a mano desde el panel de Supabase
 * (Authentication > Users) — no hay alta pública, esto es para uso personal.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError("Email o contraseña incorrectos.");
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg, color: C.textMuted }}>
        Cargando...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: C.bg }}>
        <form onSubmit={handleLogin} className="w-full max-w-xs rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <h1 className="text-lg font-semibold mb-4 text-center" style={{ color: C.text }}>Finanzas</h1>
          <Field label="Email">{(id) => <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />}</Field>
          <Field label="Contraseña">{(id) => <TextInput id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />}</Field>
          {error && <div className="text-xs mb-2" style={{ color: C.negative }}>{error}</div>}
          <PrimaryButton type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</PrimaryButton>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
