-- Suscripciones a notificaciones push (Web Push), una fila por dispositivo
-- que activó "Notificaciones" en Configuración. Se usa para avisarle a los
-- demás integrantes del hogar cuando alguien carga o cambia algo, sin
-- necesidad de tener la app abierta.
--
-- Corré este archivo completo en el SQL Editor de Supabase (Dashboard ->
-- SQL Editor -> New query -> pegar y Run). Es aditivo: no toca tablas
-- existentes.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Hogar dueño de los datos (mismo valor que finance_data.user_id /
  -- household_members.owner_id). Todos los dispositivos de todos los
  -- integrantes de un mismo hogar comparten este valor.
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Perfil (AppUser.id, un uuid generado en el cliente) al que pertenece
  -- este dispositivo. Se guarda como texto porque los ids de AppUser viven
  -- en el JSON de finance_data, no en una tabla propia.
  app_user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_owner_idx on push_subscriptions (owner_id);

alter table push_subscriptions enable row level security;

-- Cualquier integrante del hogar puede ver, agregar y borrar suscripciones
-- de su propio hogar (mismo criterio de confianza que ya se usa en
-- household_sharing.sql: quienes comparten los datos, comparten todo).
drop policy if exists "push_subscriptions_household_select" on push_subscriptions;
create policy "push_subscriptions_household_select"
  on push_subscriptions for select
  using (
    owner_id in (select owner_id from household_members where user_id = auth.uid())
  );

drop policy if exists "push_subscriptions_household_insert" on push_subscriptions;
create policy "push_subscriptions_household_insert"
  on push_subscriptions for insert
  with check (
    owner_id in (select owner_id from household_members where user_id = auth.uid())
  );

drop policy if exists "push_subscriptions_household_delete" on push_subscriptions;
create policy "push_subscriptions_household_delete"
  on push_subscriptions for delete
  using (
    owner_id in (select owner_id from household_members where user_id = auth.uid())
  );
