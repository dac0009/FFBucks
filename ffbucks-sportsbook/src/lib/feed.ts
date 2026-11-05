import { db, num, type FeedBet } from './supabase';

export async function loadFeed(opts: { owner?: string; season?: number; limit?: number } = {}): Promise<FeedBet[]> {
  let q = db().from('bet_feed').select('*').order('id', { ascending: false }).limit(opts.limit ?? 60);
  if (opts.owner) q = q.eq('owner_id', opts.owner);
  if (opts.season) q = q.eq('season', opts.season);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const bet = num(row as FeedBet, ['id', 'stake', 'potential_payout', 'payout', 'source_bet_id', 'season']);
    bet.legs = (bet.legs ?? []).map((leg) => num(leg, ['point', 'price', 'home_score', 'away_score']));
    return bet;
  });
}
