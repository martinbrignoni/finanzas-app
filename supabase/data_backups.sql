-- Respaldo automático y manual de los datos (ver Configuración -> Respaldo
-- en la app). Cada vez que se abre la app (una vez por día) o se toca
-- "Descargar respaldo ahora", se guarda una copia completa del JSON de
-- `finance_data` en esta tabla, con la fecha y si fue automático o manual.
-- La app se encarga de podar los respaldos automáticos viejos (se quedan los
-- últimos 30); los manuales no se podan solos.
--
-- Corré este archivo completo en el SQL Editor de Supabase (Dashboard ->
-- SQL Editor -> New query -> pegar y Run). Podés correrlo aunque ya tengas
-- corrido `household_sharing.sql` (o aunque no lo tengas corrido todavía):
-- las políticas de hogar compartido de acá abajo son válidas para los dos
-- casos, un solo login sigue funcionando igual que siempre.

create table if not exists data_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  trigger text not null check (trigger in ('auto', 'manual')),
  data jsonb not null
);

create index if not exists data_backups_user_created_idx
  on data_backups (user_id, created_at desc);

alter table data_backups enable row level security;

-- Caso de toda la vida: un solo login, dueño de sus propios respaldos.
drop policy if exists "data_backups_select_own" on data_backups;
create policy "data_backups_select_own"
  on data_backups for select
  using (user_id = auth.uid());

drop policy if exists "data_backups_insert_own" on data_backups;
create policy "data_backups_insert_own"
  on data_backups for insert
  with check (user_id = auth.uid());

drop policy if exists "data_backups_delete_own" on data_backups;
create policy "data_backups_delete_own"
  on data_backups for delete
  using (user_id = auth.uid());

-- Hogar compartido (ver household_sharing.sql): un login puede leer/crear/
-- borrar los respaldos de cualquier owner_id del que sea miembro. Si todavía
-- no corriste household_sharing.sql, estas políticas no aplican a nadie
-- (household_members no existe) y no rompen nada; en cuanto lo corras,
-- empiezan a funcionar solas.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'household_members') then
    execute 'drop policy if exists "data_backups_household_select" on data_backups';
    execute '
      create policy "data_backups_household_select"
        on data_backups for select
        using (user_id in (select owner_id from household_members where user_id = auth.uid()))
    ';

    execute 'drop policy if exists "data_backups_household_insert" on data_backups';
    execute '
      create policy "data_backups_household_insert"
        on data_backups for insert
        with check (user_id in (select owner_id from household_members where user_id = auth.uid()))
    ';

    execute 'drop policy if exists "data_backups_household_delete" on data_backups';
    execute '
      create policy "data_backups_household_delete"
        on data_backups for delete
        using (user_id in (select owner_id from household_members where user_id = auth.uid()))
    ';
  end if;
end $$;
