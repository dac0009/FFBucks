-- FFBucks sportsbook. Run once in the sportsbook's own Supabase project
-- (never the league site's). Play money only: nothing here can be bought,
-- cashed out or exchanged for anything of value.
--
-- Every write a member can make goes through a function below, and each
-- function is a single transaction that locks the member's row first, so a
-- balance can never go negative and nothing can be paid twice. Members cannot
-- insert, update or delete any table directly.
begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.book_state (
  id smallint primary key default 1 check (id = 1),
  season integer not null,
  last_sync_at timestamptz,
  last_sync_note text,
  -- The commissioner's tip link (Linktree or similar). Only ever a link out:
  -- tipping never grants FFBucks or any advantage.
  tip_url text check (tip_url is null or (length(tip_url) <= 300 and tip_url ~ '^https://[^[:space:]<>"''`]+$'))
);

create table public.members (
  owner_id text primary key check (owner_id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(display_name) between 1 and 60),
  is_commissioner boolean not null default false,
  balance bigint not null default 0 check (balance >= 0),
  joined_at timestamptz
);

create table public.invites (
  code text primary key,
  owner_id text not null references public.members(owner_id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid
);

-- 1,000 free FFBucks once per league owner, ever (even across new logins).
create table public.free_grants (
  owner_id text primary key references public.members(owner_id),
  granted_at timestamptz not null default now()
);

create table public.lines (
  line_id text primary key,
  season integer not null,
  week integer not null,
  game_type text,
  home_owner_id text not null,
  away_owner_id text not null,
  home_team_name text,
  away_team_name text,
  home_spread numeric(6,1) not null,
  total numeric(7,1) not null,
  home_ml integer not null check (home_ml <= -100 or home_ml >= 100),
  away_ml integer not null check (away_ml <= -100 or away_ml >= 100),
  spread_price integer not null check (spread_price <= -100 or spread_price >= 100),
  total_price integer not null check (total_price <= -100 or total_price >= 100),
  home_expected numeric(7,2),
  away_expected numeric(7,2),
  home_win_prob numeric(6,4),
  posted_at timestamptz not null default now(),
  lock_at timestamptz,
  lock_game text,
  lock_source text,
  status text not null default 'open' check (status in ('open','pulled','final')),
  pulled_at timestamptz,
  home_score numeric(7,2),
  away_score numeric(7,2),
  winner text check (winner in ('HOME','AWAY','TIE')),
  graded_at timestamptz
);
create index lines_season_week on public.lines(season, week);

create table public.bets (
  id bigint generated always as identity primary key,
  owner_id text not null references public.members(owner_id),
  season integer not null,
  stake bigint not null check (stake >= 1),
  kind text not null check (kind in ('single','parlay')),
  potential_payout bigint not null,
  status text not null default 'open' check (status in ('open','won','lost','push','void')),
  payout bigint,
  source text not null default 'slip' check (source in ('slip','tail','fade')),
  source_bet_id bigint references public.bets(id),
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);
create index bets_owner on public.bets(owner_id, id);
create index bets_open on public.bets(status) where status = 'open';

create table public.bet_legs (
  bet_id bigint not null references public.bets(id) on delete cascade,
  leg_no smallint not null check (leg_no between 1 and 6),
  line_id text not null references public.lines(line_id),
  market text not null check (market in ('ml','spread','total')),
  side text not null check (side in ('home','away','over','under')),
  point numeric(7,1),
  price integer not null,
  result text not null default 'pending' check (result in ('pending','won','lost','push','void')),
  primary key (bet_id, leg_no),
  unique (bet_id, line_id) -- no two legs from the same matchup
);
create index bet_legs_line on public.bet_legs(line_id);

create table public.ledger (
  id bigint generated always as identity primary key,
  owner_id text not null references public.members(owner_id),
  season integer not null,
  kind text not null check (kind in ('free','topup','stake','payout','refund')),
  amount bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  bet_id bigint references public.bets(id),
  created_at timestamptz not null default now()
);
create index ledger_owner on public.ledger(owner_id, id);

create table public.season_archive (
  season integer primary key,
  closed_at timestamptz not null default now(),
  jackpot bigint not null,
  standings jsonb not null
);

-- ---------------------------------------------------------------------------
-- Access: members read everything (the book is public to the league);
-- nobody writes a table directly.
-- ---------------------------------------------------------------------------

create function public.book_is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members m where m.user_id = (select auth.uid()));
$$;

create function public.book_is_commissioner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members m where m.user_id = (select auth.uid()) and m.is_commissioner);
$$;

alter table public.book_state enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.free_grants enable row level security;
alter table public.lines enable row level security;
alter table public.bets enable row level security;
alter table public.bet_legs enable row level security;
alter table public.ledger enable row level security;
alter table public.season_archive enable row level security;

revoke all on public.book_state, public.members, public.invites, public.free_grants, public.lines,
  public.bets, public.bet_legs, public.ledger, public.season_archive from anon, authenticated;
grant select on public.book_state, public.members, public.lines, public.bets, public.bet_legs,
  public.ledger, public.season_archive, public.invites to authenticated;

create policy member_read on public.book_state for select to authenticated using (public.book_is_member());
-- A signed-in user can always see their own row (so the app knows they joined).
create policy member_read on public.members for select to authenticated
  using (public.book_is_member() or user_id = (select auth.uid()));
create policy member_read on public.lines for select to authenticated using (public.book_is_member());
create policy member_read on public.bets for select to authenticated using (public.book_is_member());
create policy member_read on public.bet_legs for select to authenticated using (public.book_is_member());
create policy member_read on public.ledger for select to authenticated using (public.book_is_member());
create policy member_read on public.season_archive for select to authenticated using (public.book_is_member());
create policy commissioner_read on public.invites for select to authenticated using (public.book_is_commissioner());

-- ---------------------------------------------------------------------------
-- Odds helpers. Payouts use exact fractions: -110 is 210/110, +150 is 250/100.
-- ---------------------------------------------------------------------------

create function public.book_price_num(p integer) returns numeric
language sql immutable set search_path = '' as $$
  select case when p > 0 then p + 100 else 100 - p end::numeric;
$$;

create function public.book_price_den(p integer) returns numeric
language sql immutable set search_path = '' as $$
  select case when p > 0 then 100 else -p end::numeric;
$$;

-- Total returned (stake included) for a stake at a list of prices, rounded down.
create function public.book_payout(p_stake bigint, p_prices integer[]) returns bigint
language plpgsql immutable set search_path = '' as $$
declare num numeric := p_stake; den numeric := 1; p integer;
begin
  foreach p in array coalesce(p_prices, '{}'::integer[]) loop
    num := num * public.book_price_num(p);
    den := den * public.book_price_den(p);
  end loop;
  return div(num, den)::bigint;
end $$;

-- ---------------------------------------------------------------------------
-- Internal: ledger and grading (not callable by members)
-- ---------------------------------------------------------------------------

create function public.book_season() returns integer
language sql stable security definer set search_path = '' as $$
  select season from public.book_state where id = 1;
$$;

create function public.book_credit(p_owner text, p_amount bigint, p_kind text, p_bet bigint, p_season integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_balance bigint;
begin
  update public.members set balance = balance + p_amount where owner_id = p_owner
    returning balance into new_balance;
  if new_balance is null then raise exception 'Unknown member.'; end if;
  insert into public.ledger(owner_id, season, kind, amount, balance_after, bet_id)
    values (p_owner, p_season, p_kind, p_amount, new_balance, p_bet);
  return new_balance;
end $$;

create function public.book_leg_result(p_market text, p_side text, p_point numeric,
  p_home numeric, p_away numeric, p_winner text) returns text
language plpgsql immutable set search_path = '' as $$
declare edge numeric;
begin
  if p_market = 'ml' then
    if p_winner = 'TIE' then return 'push'; end if;
    return case when (p_winner = 'HOME') = (p_side = 'home') then 'won' else 'lost' end;
  elsif p_market = 'spread' then
    edge := case when p_side = 'home' then p_home + p_point - p_away else p_away + p_point - p_home end;
  else
    edge := case when p_side = 'over' then (p_home + p_away) - p_point else p_point - (p_home + p_away) end;
  end if;
  return case when edge > 0 then 'won' when edge = 0 then 'push' else 'lost' end;
end $$;

-- Settle one bet if it can be settled. A losing leg loses the bet; pushed legs
-- drop out of a parlay and the rest still pays; all-push is a refund.
create function public.book_settle(p_bet bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare b public.bets; won_prices integer[]; any_lost boolean; any_pending boolean; amount bigint;
begin
  select * into b from public.bets where id = p_bet for update;
  if b.status <> 'open' then return false; end if;
  select bool_or(result = 'lost'), bool_or(result = 'pending'),
         array_agg(price) filter (where result = 'won')
    into any_lost, any_pending, won_prices from public.bet_legs where bet_id = p_bet;
  if any_lost then
    update public.bets set status = 'lost', payout = 0, settled_at = now() where id = p_bet;
    return true;
  end if;
  if any_pending then return false; end if;
  if won_prices is null then
    update public.bets set status = 'push', payout = b.stake, settled_at = now() where id = p_bet;
    perform public.book_credit(b.owner_id, b.stake, 'refund', p_bet, b.season);
  else
    amount := public.book_payout(b.stake, won_prices);
    update public.bets set status = 'won', payout = amount, settled_at = now() where id = p_bet;
    perform public.book_credit(b.owner_id, amount, 'payout', p_bet, b.season);
  end if;
  return true;
end $$;

-- Refund every open bet that touches a line (pulled line or abandoned game).
create function public.book_void_line(p_line text) returns integer
language plpgsql security definer set search_path = '' as $$
declare b record; refunded integer := 0;
begin
  update public.bet_legs set result = 'void' where line_id = p_line and result = 'pending';
  for b in select bt.id, bt.owner_id, bt.stake, bt.season from public.bets bt
           where bt.status = 'open'
             and exists(select 1 from public.bet_legs l where l.bet_id = bt.id and l.line_id = p_line)
           order by bt.id for update loop
    update public.bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
    perform public.book_credit(b.owner_id, b.stake, 'refund', b.id, b.season);
    refunded := refunded + 1;
  end loop;
  return refunded;
end $$;

-- ---------------------------------------------------------------------------
-- Leaderboard: season net = settled betting profit minus top-ups that season.
-- ---------------------------------------------------------------------------

create function public.book_standings(p_season integer) returns table (
  owner_id text, display_name text, balance bigint, topups integer, owed_to_pot bigint,
  betting_net bigint, net bigint, settled integer, wins integer, losses integer, pushes integer,
  staked bigint
) language sql stable security definer set search_path = '' as $$
  select m.owner_id, m.display_name, m.balance,
    coalesce(t.n, 0)::integer, coalesce(t.amount, 0)::bigint,
    coalesce(s.net, 0)::bigint, (coalesce(s.net, 0) - coalesce(t.amount, 0))::bigint,
    coalesce(s.settled, 0)::integer, coalesce(s.wins, 0)::integer,
    coalesce(s.losses, 0)::integer, coalesce(s.pushes, 0)::integer, coalesce(s.staked, 0)::bigint
  from public.members m
  left join (select l.owner_id, count(*) n, sum(l.amount) amount from public.ledger l
             where l.kind = 'topup' and l.season = p_season group by l.owner_id) t on t.owner_id = m.owner_id
  left join (select b.owner_id, sum(b.payout - b.stake) net, count(*) settled,
                    count(*) filter (where b.status = 'won') wins,
                    count(*) filter (where b.status = 'lost') losses,
                    count(*) filter (where b.status in ('push','void')) pushes,
                    sum(b.stake) staked
             from public.bets b where b.season = p_season and b.status <> 'open'
             group by b.owner_id) s on s.owner_id = m.owner_id
  where m.user_id is not null or t.n is not null or s.settled is not null
  order by 7 desc, 3 desc, 2;
$$;

create view public.leaderboard with (security_invoker = true) as
  select st.*, bs.season
  from public.book_state bs, public.book_standings(bs.season) st
  where public.book_is_member();

create view public.jackpot with (security_invoker = true) as
  select bs.season, coalesce((select sum(l.amount) from public.ledger l
    where l.kind = 'topup' and l.season = bs.season), 0)::bigint as amount
  from public.book_state bs where public.book_is_member();

create view public.bet_feed with (security_invoker = true) as
  select b.id, b.owner_id, m.display_name, b.season, b.stake, b.kind, b.potential_payout,
    b.status, b.payout, b.source, b.source_bet_id, b.placed_at, b.settled_at,
    (select jsonb_agg(jsonb_build_object(
        'leg_no', l.leg_no, 'line_id', l.line_id, 'market', l.market, 'side', l.side,
        'point', l.point, 'price', l.price, 'result', l.result, 'week', ln.week,
        'home_owner_id', ln.home_owner_id, 'away_owner_id', ln.away_owner_id,
        'home_team_name', ln.home_team_name, 'away_team_name', ln.away_team_name,
        'lock_at', ln.lock_at, 'line_status', ln.status,
        'home_score', ln.home_score, 'away_score', ln.away_score) order by l.leg_no)
      from public.bet_legs l join public.lines ln on ln.line_id = l.line_id
      where l.bet_id = b.id) as legs
  from public.bets b join public.members m on m.owner_id = b.owner_id;

revoke all on public.leaderboard, public.jackpot, public.bet_feed from anon, authenticated;
grant select on public.leaderboard, public.jackpot, public.bet_feed to authenticated;

-- ---------------------------------------------------------------------------
-- Member actions
-- ---------------------------------------------------------------------------

create function public.book_me_for_update() returns public.members
language plpgsql security definer set search_path = '' as $$
declare m public.members;
begin
  select * into m from public.members where user_id = (select auth.uid()) for update;
  if m.owner_id is null then raise exception 'Join with your invite code first.'; end if;
  return m;
end $$;

-- Validate one leg against the posted line and price it from the line itself.
create function public.book_price_leg(p_owner text, p_line public.lines, p_market text, p_side text,
  out o_point numeric, out o_price integer)
language plpgsql stable security definer set search_path = '' as $$
declare own_side text;
begin
  if p_line.line_id is null then raise exception 'That line does not exist.'; end if;
  if p_line.status = 'pulled' then raise exception 'That line was pulled.'; end if;
  if p_line.status <> 'open' then raise exception 'That game is already graded.'; end if;
  if p_line.lock_at is null then raise exception 'That line is not open for betting yet.'; end if;
  if now() >= p_line.lock_at then raise exception 'That game is locked.'; end if;
  if p_line.season <> public.book_season() then raise exception 'That line is from another season.'; end if;

  own_side := case p_owner when p_line.home_owner_id then 'home' when p_line.away_owner_id then 'away' end;
  if own_side is not null then
    if p_market = 'total' then
      raise exception 'Over/unders are not allowed on your own game.';
    end if;
    if p_side <> own_side then
      raise exception 'You can bet on your own team to win or cover, never against yourself.';
    end if;
  end if;

  if p_market = 'ml' and p_side in ('home','away') then
    o_point := null;
    o_price := case p_side when 'home' then p_line.home_ml else p_line.away_ml end;
  elsif p_market = 'spread' and p_side in ('home','away') then
    o_point := case p_side when 'home' then p_line.home_spread else -p_line.home_spread end;
    o_price := p_line.spread_price;
  elsif p_market = 'total' and p_side in ('over','under') then
    o_point := p_line.total;
    o_price := p_line.total_price;
  else
    raise exception 'Unknown bet type.';
  end if;
end $$;

create function public.book_place(p_owner text, p_legs jsonb, p_stake bigint, p_source text, p_source_bet bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  m public.members; ln public.lines; leg jsonb; n integer; i integer := 0;
  priced record; prices integer[] := '{}'; v_bet bigint; v_season integer := public.book_season();
begin
  select * into m from public.members where owner_id = p_owner for update;
  if p_legs is null or jsonb_typeof(p_legs) <> 'array' then raise exception 'Bad bet slip.'; end if;
  n := jsonb_array_length(p_legs);
  if n < 1 then raise exception 'Your slip is empty.'; end if;
  if n > 6 then raise exception 'Parlays can have at most 6 legs.'; end if;
  if (select count(distinct x->>'line_id') from jsonb_array_elements(p_legs) x) <> n then
    raise exception 'A parlay cannot have two legs from the same matchup.';
  end if;
  if p_stake is null or p_stake < 1 then raise exception 'Bet at least 1 FFBuck.'; end if;
  if p_stake > m.balance then raise exception 'Not enough FFBucks. Top up to keep playing.'; end if;

  insert into public.bets(owner_id, season, stake, kind, potential_payout, source, source_bet_id)
    values (p_owner, v_season, p_stake, case when n = 1 then 'single' else 'parlay' end, 0, p_source, p_source_bet)
    returning id into v_bet;

  for leg in select * from jsonb_array_elements(p_legs) loop
    i := i + 1;
    select * into ln from public.lines where line_id = leg->>'line_id' for share;
    select * into priced from public.book_price_leg(p_owner, ln, leg->>'market', leg->>'side');
    insert into public.bet_legs(bet_id, leg_no, line_id, market, side, point, price)
      values (v_bet, i, ln.line_id, leg->>'market', leg->>'side', priced.o_point, priced.o_price);
    prices := prices || priced.o_price;
  end loop;

  update public.bets set potential_payout = public.book_payout(p_stake, prices) where id = v_bet;
  perform public.book_credit(p_owner, -p_stake, 'stake', v_bet, v_season);
  return v_bet;
end $$;

create function public.place_bet(p_legs jsonb, p_stake bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.members := public.book_me_for_update();
begin
  return public.book_place(m.owner_id, p_legs, p_stake, 'slip', null);
end $$;

create function public.tail_bet(p_bet_id bigint, p_stake bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.members := public.book_me_for_update(); src public.bets; legs jsonb;
begin
  select * into src from public.bets where id = p_bet_id;
  if src.id is null then raise exception 'That bet does not exist.'; end if;
  if src.owner_id = m.owner_id then raise exception 'That is your own bet.'; end if;
  select jsonb_agg(jsonb_build_object('line_id', line_id, 'market', market, 'side', side) order by leg_no)
    into legs from public.bet_legs where bet_id = p_bet_id;
  return public.book_place(m.owner_id, legs, p_stake, 'tail', p_bet_id);
end $$;

create function public.fade_bet(p_bet_id bigint, p_stake bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.members := public.book_me_for_update(); src public.bets; legs jsonb;
begin
  select * into src from public.bets where id = p_bet_id;
  if src.id is null then raise exception 'That bet does not exist.'; end if;
  if src.owner_id = m.owner_id then raise exception 'That is your own bet.'; end if;
  if src.kind <> 'single' then raise exception 'Only single bets can be faded.'; end if;
  select jsonb_agg(jsonb_build_object('line_id', line_id, 'market', market, 'side',
           case side when 'home' then 'away' when 'away' then 'home' when 'over' then 'under' else 'over' end))
    into legs from public.bet_legs where bet_id = p_bet_id;
  return public.book_place(m.owner_id, legs, p_stake, 'fade', p_bet_id);
end $$;

-- 1,000 FFBucks, any time. Adds 1,000 to this season's "owed to the pot".
create function public.top_up() returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.members := public.book_me_for_update();
begin
  if public.book_season() is null then raise exception 'The book is not open yet.'; end if;
  return public.book_credit(m.owner_id, 1000, 'topup', null, public.book_season());
end $$;

-- Link this login to the league owner on the invite. Grants the one-time
-- 1,000 free FFBucks the first time that owner ever joins.
create function public.claim_invite(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare inv public.invites; uid uuid := (select auth.uid()); linked text;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select * into inv from public.invites where code = upper(trim(p_code)) for update;
  if inv.code is null or inv.used_at is not null then raise exception 'That invite code is not valid.'; end if;
  select owner_id into linked from public.members where user_id = uid;
  if linked is not null and linked <> inv.owner_id then
    raise exception 'This login is already linked to another owner.';
  end if;
  perform 1 from public.members where owner_id = inv.owner_id for update;
  update public.members set user_id = uid, joined_at = coalesce(joined_at, now()) where owner_id = inv.owner_id;
  update public.invites set used_at = now(), used_by = uid where code = inv.code;
  insert into public.free_grants(owner_id) values (inv.owner_id) on conflict do nothing;
  if found then
    perform public.book_credit(inv.owner_id, 1000, 'free', null, coalesce(public.book_season(), 0));
  end if;
  return inv.owner_id;
end $$;

-- ---------------------------------------------------------------------------
-- Commissioner actions
-- ---------------------------------------------------------------------------

-- Add (or re-invite) a league owner. Returns a new one-time code; any older
-- unused code for that owner stops working. Re-inviting someone who already
-- joined moves their account (balance, bets, history) to the new login.
create function public.book_invite(p_owner_id text, p_display_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare new_code text;
begin
  if not public.book_is_commissioner() then raise exception 'Commissioner only.'; end if;
  insert into public.members(owner_id, display_name) values (p_owner_id, trim(p_display_name))
    on conflict (owner_id) do update set display_name = excluded.display_name;
  delete from public.invites where owner_id = p_owner_id and used_at is null;
  new_code := upper(substr(md5(random()::text || clock_timestamp()::text || p_owner_id), 1, 10));
  insert into public.invites(code, owner_id) values (new_code, p_owner_id);
  return new_code;
end $$;

-- Emergency button: remove a broken line and refund every bet on it.
-- No manual adjusting of lines exists anywhere.
create function public.pull_line(p_line_id text) returns integer
language plpgsql security definer set search_path = '' as $$
declare ln public.lines;
begin
  if not public.book_is_commissioner() then raise exception 'Commissioner only.'; end if;
  select * into ln from public.lines where line_id = p_line_id for update;
  if ln.line_id is null then raise exception 'That line does not exist.'; end if;
  if ln.status <> 'open' then raise exception 'That line is already %.', ln.status; end if;
  update public.lines set status = 'pulled', pulled_at = now() where line_id = p_line_id;
  return public.book_void_line(p_line_id);
end $$;

-- The tip button's link. Paste any https link; blank removes the button.
create function public.set_tip_url(p_url text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := nullif(trim(coalesce(p_url, '')), '');
begin
  if not public.book_is_commissioner() then raise exception 'Commissioner only.'; end if;
  if v is not null and (length(v) > 300 or v !~ '^https://[^[:space:]<>"''`]+$') then
    raise exception 'The tip link must start with https:// and have no spaces.';
  end if;
  update public.book_state set tip_url = v where id = 1;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Sync from the league site's data/sportsbook/lines.json (service role only)
-- ---------------------------------------------------------------------------

create function public.book_close_season(p_season integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ln record; pot bigint; board jsonb;
begin
  if exists(select 1 from public.season_archive where season = p_season) then return false; end if;
  -- Anything still open (a game that never got a result) is refunded.
  for ln in select line_id from public.lines where season = p_season and status = 'open' for update loop
    update public.lines set status = 'pulled', pulled_at = now() where line_id = ln.line_id;
    perform public.book_void_line(ln.line_id);
  end loop;
  select coalesce(sum(amount), 0) into pot from public.ledger where kind = 'topup' and season = p_season;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.net desc, s.balance desc), '[]'::jsonb)
    into board from public.book_standings(p_season) s;
  insert into public.season_archive(season, jackpot, standings) values (p_season, pot, board);
  update public.book_state set season = greatest(season, p_season + 1) where id = 1;
  return true;
end $$;

create function public.sync_board(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  state public.book_state; v_season integer := (p->>'season')::integer;
  item jsonb; ln public.lines; leg record; b record;
  added integer := 0; moved integer := 0; graded integer := 0; settled integer := 0;
  closed boolean := false; new_lock timestamptz;
begin
  if v_season is null then raise exception 'lines.json has no season'; end if;
  insert into public.book_state(id, season) values (1, v_season) on conflict (id) do nothing;
  select * into state from public.book_state where id = 1 for update;
  if v_season > state.season then
    perform public.book_close_season(state.season);
    update public.book_state set season = v_season where id = 1;
    select * into state from public.book_state where id = 1;
  end if;

  -- 1. Grade every open line that now has a final score.
  for item in select * from jsonb_array_elements(coalesce(p->'results', '[]'::jsonb)) loop
    continue when coalesce(item->>'winner', '') not in ('HOME','AWAY','TIE')
      or item->>'home_score' is null or item->>'away_score' is null;
    update public.lines set status = 'final', home_score = (item->>'home_score')::numeric,
      away_score = (item->>'away_score')::numeric, winner = item->>'winner', graded_at = now()
      where line_id = item->>'matchup_id' and status = 'open' and season = v_season
      returning * into ln;
    continue when not found;
    graded := graded + 1;
    for leg in select * from public.bet_legs where line_id = ln.line_id and result = 'pending' for update loop
      update public.bet_legs set result = public.book_leg_result(leg.market, leg.side, leg.point,
        ln.home_score, ln.away_score, ln.winner) where bet_id = leg.bet_id and leg_no = leg.leg_no;
    end loop;
    for b in select distinct bet_id from public.bet_legs where line_id = ln.line_id order by bet_id loop
      if public.book_settle(b.bet_id) then settled := settled + 1; end if;
    end loop;
  end loop;

  -- 2. Post new lines. A posted line is never re-priced; only the lock time of
  --    a line that has not locked yet can change.
  if v_season = state.season then
    for item in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
      continue when (item->>'season')::integer is distinct from v_season;
      new_lock := nullif(item->>'lock_at', '')::timestamptz;
      select * into ln from public.lines where line_id = item->>'line_id' for update;
      if ln.line_id is null then
        insert into public.lines(line_id, season, week, game_type, home_owner_id, away_owner_id,
          home_team_name, away_team_name, home_spread, total, home_ml, away_ml, spread_price,
          total_price, home_expected, away_expected, home_win_prob, posted_at, lock_at, lock_game, lock_source)
        values (item->>'line_id', v_season, (item->>'week')::integer, item->>'game_type',
          item->>'home_owner_id', item->>'away_owner_id', item->>'home_team_name', item->>'away_team_name',
          (item->>'home_spread')::numeric, (item->>'total')::numeric, (item->>'home_ml')::integer,
          (item->>'away_ml')::integer, (item->>'spread_price')::integer, (item->>'total_price')::integer,
          (item->>'home_expected')::numeric, (item->>'away_expected')::numeric,
          (item->>'home_win_prob')::numeric, coalesce((item->>'posted_at')::timestamptz, now()),
          new_lock, item->>'lock_game', item->>'lock_source');
        added := added + 1;
      elsif ln.status = 'open' and new_lock is not null and new_lock is distinct from ln.lock_at
            and (ln.lock_at is null or ln.lock_at > now()) then
        update public.lines set lock_at = new_lock, lock_game = item->>'lock_game',
          lock_source = item->>'lock_source' where line_id = ln.line_id;
        moved := moved + 1;
      end if;
    end loop;
  end if;

  -- 3. Season over: save the leaderboard and pot, start fresh. Balances carry over.
  if coalesce((p->>'season_complete')::boolean, false) and v_season = state.season then
    closed := public.book_close_season(v_season);
  end if;

  update public.book_state set last_sync_at = now(),
    last_sync_note = format('%s games graded, %s bets settled, %s new lines, %s locks moved%s',
      graded, settled, added, moved, case when closed then ', season closed' else '' end)
    where id = 1;
  return jsonb_build_object('graded', graded, 'settled', settled, 'added', added,
    'locks_moved', moved, 'season_closed', closed);
end $$;

-- ---------------------------------------------------------------------------
-- Function permissions: members get only the actions; the sync is server-only.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.book_is_member(), public.book_is_commissioner(),
  public.book_standings(integer), public.place_bet(jsonb, bigint), public.tail_bet(bigint, bigint),
  public.fade_bet(bigint, bigint), public.top_up(), public.claim_invite(text),
  public.book_invite(text, text), public.pull_line(text), public.set_tip_url(text) to authenticated;
grant execute on function public.sync_board(jsonb) to service_role;

-- The book starts in the current NFL season; the first sync confirms it.
insert into public.book_state(id, season)
  values (1, extract(year from now() - interval '2 months')::integer);

-- The commissioner.
insert into public.members(owner_id, display_name, is_commissioner)
  values ('dominick-cifelli', 'Dominick Cifelli', true);
insert into public.invites(code, owner_id)
  values (upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)), 'dominick-cifelli');

commit;

-- Your own invite code. Copy it, then join on the sportsbook's sign-in page.
select code as your_invite_code from public.invites where owner_id = 'dominick-cifelli';
