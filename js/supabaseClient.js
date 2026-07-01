// ══════════════════════════════════════════════════════
// SUPABASE CLIENT SINGLETON
// ══════════════════════════════════════════════════════
// Jeden sdílený klient pro sync.js i visitStore.js — oba moduly dřív
// vytvářely vlastní instanci, což vedlo ke dvěma WebSocket spojením
// a potenciálnímu auth race (session nastavená na jednom klientu
// nemusela být viditelná na druhém dřív než Supabase JS SDK uložilo
// token do localStorage).
//
// Supabase JS SDK v2 sice ukládá auth stav do localStorage automaticky
// a nový klient ho tam najde, ale sdílená instance je čistší a garantuje
// že auth session je vždy konzistentní bez závislosti na timing.
//
// Načítá se PŘED sync.js i visitStore.js (viz index.html).
// ══════════════════════════════════════════════════════

const AllwynSupabase = (function(){
  let _client = null;

  function isConfigured(){
    return !!(window.ALLWYN_SUPABASE_URL && window.ALLWYN_SUPABASE_ANON_KEY && window.supabase);
  }

  function getClient(){
    if (!isConfigured()) return null;
    if (!_client){
      _client = window.supabase.createClient(
        window.ALLWYN_SUPABASE_URL,
        window.ALLWYN_SUPABASE_ANON_KEY
      );
    }
    return _client;
  }

  return { isConfigured, getClient };
})();
