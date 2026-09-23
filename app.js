const SUPABASE_URL = 'https://kupwqulxzsgupyowpsnd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8DiVJX0CTBUtmPUnu3ihvw_aOgWsjpz';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const { error } = await supabase.from('prueba').select('*');
document.getElementById('estado').textContent =
  error ? 'Error: ' + error.message : 'Conectado a Supabase ✅';
