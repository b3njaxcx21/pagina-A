-- =============================================
--  App de parejas - Base de datos (Fase 1)
--  Pegar TODO en Supabase > SQL Editor > Run
-- =============================================

-- ---------- TABLAS ----------
create table if not exists public.parejas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null default upper(substr(md5(random()::text), 1, 6)),
  fecha_inicio date,
  creado_en timestamptz not null default now()
);

create table if not exists public.perfiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text,
  pareja_id uuid references public.parejas on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas on delete cascade,
  autor_id uuid not null default auth.uid() references auth.users on delete cascade,
  texto text,
  archivo_path text,
  tipo text not null default 'texto' check (tipo in ('texto', 'foto', 'video')),
  creado_en timestamptz not null default now()
);

create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas on delete cascade,
  autor_id uuid not null default auth.uid() references auth.users on delete cascade,
  texto text not null check (length(texto) between 1 and 2000),
  creado_en timestamptz not null default now()
);

create index if not exists publicaciones_pareja_idx on public.publicaciones (pareja_id, creado_en desc);
create index if not exists mensajes_pareja_idx on public.mensajes (pareja_id, creado_en);
create index if not exists perfiles_pareja_idx on public.perfiles (pareja_id);

-- ---------- FUNCION: ¿cuál es mi pareja? ----------
create or replace function public.mi_pareja()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select pareja_id from public.perfiles where id = auth.uid()
$$;

-- ---------- PERFIL AUTOMÁTICO AL REGISTRARSE ----------
create or replace function public.nuevo_usuario()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- ---------- CREAR / UNIRSE A UNA PAREJA ----------
create or replace function public.crear_pareja()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_codigo text;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  if (select pareja_id from perfiles where id = auth.uid()) is not null then
    raise exception 'Ya tienes pareja vinculada';
  end if;
  insert into parejas default values returning id, codigo into v_id, v_codigo;
  update perfiles set pareja_id = v_id where id = auth.uid();
  return v_codigo;
end;
$$;

create or replace function public.unirse_pareja(p_codigo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  if (select pareja_id from perfiles where id = auth.uid()) is not null then
    raise exception 'Ya tienes pareja vinculada';
  end if;
  select id into v_id from parejas where codigo = upper(trim(p_codigo));
  if v_id is null then raise exception 'Código no válido'; end if;
  if (select count(*) from perfiles where pareja_id = v_id) >= 2 then
    raise exception 'Esta pareja ya está completa';
  end if;
  update perfiles set pareja_id = v_id where id = auth.uid();
end;
$$;

create or replace function public.actualizar_fecha_inicio(p_fecha date)
returns void
language sql security definer
set search_path = public
as $$
  update parejas set fecha_inicio = p_fecha where id = (select pareja_id from perfiles where id = auth.uid());
$$;

revoke execute on function public.crear_pareja() from public, anon;
revoke execute on function public.unirse_pareja(text) from public, anon;
revoke execute on function public.actualizar_fecha_inicio(date) from public, anon;
revoke execute on function public.nuevo_usuario() from public, anon, authenticated;
grant execute on function public.crear_pareja() to authenticated;
grant execute on function public.unirse_pareja(text) to authenticated;
grant execute on function public.actualizar_fecha_inicio(date) to authenticated;
grant execute on function public.mi_pareja() to authenticated;

-- ---------- SEGURIDAD (RLS): solo tu pareja ve tus cosas ----------
alter table public.parejas enable row level security;
alter table public.perfiles enable row level security;
alter table public.publicaciones enable row level security;
alter table public.mensajes enable row level security;

-- parejas
drop policy if exists "ver mi pareja" on public.parejas;
create policy "ver mi pareja" on public.parejas
  for select to authenticated using (id = public.mi_pareja());

-- perfiles (solo se puede cambiar el nombre propio)
drop policy if exists "ver perfiles" on public.perfiles;
create policy "ver perfiles" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or (pareja_id is not null and pareja_id = public.mi_pareja()));

drop policy if exists "editar mi perfil" on public.perfiles;
create policy "editar mi perfil" on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke update on public.perfiles from authenticated;
grant update (nombre) on public.perfiles to authenticated;

-- publicaciones
drop policy if exists "ver publicaciones" on public.publicaciones;
create policy "ver publicaciones" on public.publicaciones
  for select to authenticated using (pareja_id = public.mi_pareja());

drop policy if exists "crear publicaciones" on public.publicaciones;
create policy "crear publicaciones" on public.publicaciones
  for insert to authenticated
  with check (pareja_id = public.mi_pareja() and autor_id = auth.uid());

drop policy if exists "borrar mis publicaciones" on public.publicaciones;
create policy "borrar mis publicaciones" on public.publicaciones
  for delete to authenticated using (autor_id = auth.uid());

-- mensajes
drop policy if exists "ver mensajes" on public.mensajes;
create policy "ver mensajes" on public.mensajes
  for select to authenticated using (pareja_id = public.mi_pareja());

drop policy if exists "enviar mensajes" on public.mensajes;
create policy "enviar mensajes" on public.mensajes
  for insert to authenticated
  with check (pareja_id = public.mi_pareja() and autor_id = auth.uid());

-- ---------- TIEMPO REAL (chat y muro) ----------
do $$
begin
  begin alter publication supabase_realtime add table public.mensajes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.publicaciones; exception when duplicate_object then null; end;
end $$;

-- ---------- ALMACENAMIENTO DE FOTOS Y VIDEOS (privado) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('recuerdos', 'recuerdos', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "ver archivos de mi pareja" on storage.objects;
create policy "ver archivos de mi pareja" on storage.objects
  for select to authenticated
  using (bucket_id = 'recuerdos' and (storage.foldername(name))[1] = public.mi_pareja()::text);

drop policy if exists "subir archivos a mi pareja" on storage.objects;
create policy "subir archivos a mi pareja" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recuerdos' and (storage.foldername(name))[1] = public.mi_pareja()::text);

drop policy if exists "borrar mis archivos" on storage.objects;
create policy "borrar mis archivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recuerdos' and owner_id = auth.uid()::text);

-- ---------- LIMPIEZA: la tabla de prueba ya no se usa ----------
drop table if exists public.prueba;

-- ---------- FOTO DE PERFIL ----------
alter table public.perfiles add column if not exists avatar_path text;
grant update (nombre, avatar_path) on public.perfiles to authenticated;

-- ---------- NUESTRA CANCIÓN (enlace de Spotify compartido) ----------
alter table public.parejas add column if not exists cancion_url text;

create or replace function public.actualizar_cancion(p_url text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- Solo la cuenta de Benjamin puede cambiar la canción
  if (select email from auth.users where id = auth.uid()) is distinct from 'benjamin@nosotros.app' then
    raise exception 'Solo Benjamin puede cambiar la canción';
  end if;
  update parejas set cancion_url = p_url where id = (select pareja_id from perfiles where id = auth.uid());
end;
$$;

revoke execute on function public.actualizar_cancion(text) from public, anon;
grant execute on function public.actualizar_cancion(text) to authenticated;
