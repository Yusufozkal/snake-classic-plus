export function database(env) {
  if (!env.DB?.prepare) throw new Error('Database unavailable');
  return env.DB;
}
