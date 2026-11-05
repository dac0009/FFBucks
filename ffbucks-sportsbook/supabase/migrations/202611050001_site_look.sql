-- FFBucks look editor: the commissioner's colors, fonts and wording.
-- Run once in the sportsbook's Supabase project, after the first migration.
--
-- Anyone (even before signing in) can read the look so the sign-in page
-- matches. Only the commissioner can change it, and every value is checked
-- here: colors must be #rrggbb, fonts must come from a fixed list, and wording
-- is plain text with a length limit. The legal notice is not editable.
begin;

create table public.site_look (
  id smallint primary key default 1 check (id = 1),
  theme jsonb not null default '{}'::jsonb,
  copy jsonb not null default '{}'::jsonb,
  previous_theme jsonb,
  previous_copy jsonb,
  updated_at timestamptz,
  updated_by text
);
insert into public.site_look(id) values (1);

alter table public.site_look enable row level security;
revoke all on public.site_look from anon, authenticated;

create function public.get_site_look() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('theme', theme, 'copy', copy, 'updated_at', updated_at,
    'has_previous', previous_theme is not null)
  from public.site_look where id = 1;
$$;

create function public.book_check_look(p_theme jsonb, p_copy jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
  color_keys text[] := array['bg','surface','surface_alt','ink','ink_soft','rule','accent','accent_ink',
    'highlight','pos','neg','masthead_bg','masthead_ink','masthead_rule'];
  font_keys text[] := array['font_display','font_body'];
  fonts text[] := array['Newsreader','Playfair Display','Libre Baskerville','Old Standard TT','Libre Caslon Text',
    'Georgia','Inter','IBM Plex Sans','Barlow','Barlow Condensed','Source Sans 3'];
begin
  if jsonb_typeof(coalesce(p_theme, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_copy, '{}'::jsonb)) <> 'object' then
    raise exception 'The look must be a list of settings.';
  end if;
  for k, v in select * from jsonb_each(coalesce(p_theme, '{}'::jsonb)) loop
    if k = any(color_keys) then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'Color % must look like #1d303a.', k;
      end if;
    elsif k = any(font_keys) then
      if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any(fonts)) then
        raise exception 'Font % is not one of the available fonts.', k;
      end if;
    else
      raise exception 'Unknown look setting %.', k;
    end if;
  end loop;
  if (select count(*) from jsonb_object_keys(coalesce(p_copy, '{}'::jsonb))) > 200 then
    raise exception 'Too many wording changes.';
  end if;
  for k, v in select * from jsonb_each(coalesce(p_copy, '{}'::jsonb)) loop
    if k !~ '^[a-z][a-z0-9_.]{0,60}$' then raise exception 'Unknown wording key.'; end if;
    if jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 500 then
      raise exception 'Each piece of wording must be text under 500 characters.';
    end if;
  end loop;
end $$;

-- Save the look for everyone. The version it replaces is kept so one click
-- can bring it back.
create function public.set_site_look(p_theme jsonb, p_copy jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if not public.book_is_commissioner() then raise exception 'Commissioner only.'; end if;
  perform public.book_check_look(p_theme, p_copy);
  select owner_id into who from public.members where user_id = (select auth.uid());
  update public.site_look set previous_theme = theme, previous_copy = copy,
    theme = coalesce(p_theme, '{}'::jsonb), copy = coalesce(p_copy, '{}'::jsonb),
    updated_at = now(), updated_by = who
    where id = 1;
  return public.get_site_look();
end $$;

-- Undo the last save (swaps back and forth).
create function public.restore_site_look() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur public.site_look;
begin
  if not public.book_is_commissioner() then raise exception 'Commissioner only.'; end if;
  select * into cur from public.site_look where id = 1 for update;
  if cur.previous_theme is null then raise exception 'There is no earlier version to go back to.'; end if;
  update public.site_look set theme = cur.previous_theme, copy = cur.previous_copy,
    previous_theme = cur.theme, previous_copy = cur.copy, updated_at = now()
    where id = 1;
  return public.get_site_look();
end $$;

revoke execute on function public.get_site_look(), public.book_check_look(jsonb, jsonb),
  public.set_site_look(jsonb, jsonb), public.restore_site_look() from public, anon, authenticated;
grant execute on function public.get_site_look() to anon, authenticated;
grant execute on function public.set_site_look(jsonb, jsonb), public.restore_site_look() to authenticated;

commit;

select 'Look editor installed' as result;
