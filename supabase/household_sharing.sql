-- Login separado para compartir los mismos datos entre dos personas del
-- mismo hogar (ej. vos y tu pareja), sin usar el mismo email/contraseña.
--
-- Idea: cada login de Supabase Auth (auth.users) se mapea a un "dueño"
-- (owner_id) en la tabla household_members. Todos los logins mapeados al
-- mismo owner_id leen y escriben la misma fila de `finance_data` y los
-- mismos comprobantes en Storage. Por defecto cada usuario es dueño de sí
-- mismo (self-mapping), así que esto no cambia nada para el uso de toda
-- la vida con un solo login.
--
-- Las políticas de este archivo son ADITIVAS: se agregan a las que ya
-- existen en `finance_data` y `storage.objects`, no las reemplazan. Postgres
-- combina políticas permisivas con OR, así que esto es de bajo riesgo: no
-- hace falta tocar ni borrar ninguna política existente.
--
-- Corré este archivo completo en el SQL Editor de Supabase (Dashboard ->
-- SQL Editor -> New query -> pegar y Run).

-- 1) Tabla de mapeo login -> dueño de los datos.
create table if not exists household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade
);

alter table household_members enable row level security;

-- Cada login solo puede leer su propia fila de mapeo (necesario para que el
-- cliente resuelva su owner_id).
drop policy if exists "household_members_select_own" on household_members;
create policy "household_members_select_own"
  on household_members for select
  using (user_id = auth.uid());

-- 2) Backfill: todo login existente hoy queda mapeado a sí mismo (no rompe
-- nada de lo que ya está andando).
insert into household_members (user_id, owner_id)
select id, id from auth.users
on conflict (user_id) do nothing;

-- 3) Políticas aditivas en finance_data: un login puede leer/escribir la
-- fila de finance_data de cualquier owner_id del que sea miembro.
drop policy if exists "finance_data_household_select" on finance_data;
create policy "finance_data_household_select"
  on finance_data for select
  using (
    user_id in (select owner_id from household_members where user_id = auth.uid())
  );

drop policy if exists "finance_data_household_insert" on finance_data;
create policy "finance_data_household_insert"
  on finance_data for insert
  with check (
    user_id in (select owner_id from household_members where user_id = auth.uid())
  );

drop policy if exists "finance_data_household_update" on finance_data;
create policy "finance_data_household_update"
  on finance_data for update
  using (
    user_id in (select owner_id from household_members where user_id = auth.uid())
  )
  with check (
    user_id in (select owner_id from household_members where user_id = auth.uid())
  );

-- 4) Políticas aditivas en storage.objects para el bucket "receipts": la
-- carpeta de cada archivo es `${ownerId}/...`, así que se compara el primer
-- segmento del path contra los owner_id del login.
drop policy if exists "receipts_household_select" on storage.objects;
create policy "receipts_household_select"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select owner_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "receipts_household_insert" on storage.objects;
create policy "receipts_household_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select owner_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "receipts_household_update" on storage.objects;
create policy "receipts_household_update"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select owner_id from household_members where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select owner_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "receipts_household_delete" on storage.objects;
create policy "receipts_household_delete"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select owner_id from household_members where user_id = auth.uid()
    )
  );

-- 5) Para agregar a tu pareja como miembro de tu hogar (después de crear su
-- usuario en Authentication > Users):
--
--   select id, email from auth.users;
--
-- Anotá su uid (el de ella) y el tuyo, y corré (reemplazando los valores):
--
--   insert into household_members (user_id, owner_id)
--   values ('<uid-de-tu-pareja>', '<uid-tuyo>');
--
-- A partir de ahí, cuando ella inicie sesión con su propio email va a leer
-- y escribir exactamente los mismos datos que vos.
