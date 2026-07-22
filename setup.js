const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function setup() {
  const { data: user, error: err } = await supabase.auth.admin.createUser({
    email: 'muheebzahid@gmail.com',
    password: 'mUHEEB123',
    email_confirm: true
  });

  if (err) {
    console.error('Error creating user:', err);
    return;
  }

  const userId = user.user.id;

  // Insert role
  await supabase.from('admin_roles').insert({ user_id: userId, role: 'SUPER_ADMIN' });

  // Insert profile
  const { data: roles } = await supabase.from('roles').select('id').eq('name', 'super_admin').single();
  const { data: companies } = await supabase.from('companies').select('id').eq('name', 'Mobitech Wireless').single();
  
  if (roles && companies) {
    await supabase.from('user_profiles').insert({
      id: userId,
      full_name: 'Muheeb',
      role_id: roles.id,
      company_id: companies.id
    });
  }

  // Insert partner
  await supabase.from('partners').insert({
    name: 'Muheeb',
    user_profile_id: userId,
    ownership_percentage: 33.33,
    monthly_salary_aed: 15000.00,
    is_working_partner: true
  });
  
  console.log('Successfully created admin user locally!');
}
setup();
