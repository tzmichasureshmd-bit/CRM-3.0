/**
 * CRM 3.0 Migration Runner
 * Applies all migrations to Supabase in order
 * Run with: node scripts/apply-migrations.js
 * 
 * This script uses Supabase SQL Editor API to execute migrations
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];

// Migration order (critical - must be in sequence)
const MIGRATIONS = [
  'APPLY_THIS_FIRST_IN_SUPABASE.sql',
  '001_crm3_foundation.sql',
  '002_conversation_ai_columns.sql',
  '003_smart_automation_ai.sql',
  '004_ai_agents_full.sql',
  '005_attribution_enhancements.sql',
  '006_journey_builder.sql',
  '007_journey_scheduler.sql',
];

function cleanSql(sql) {
  // Remove BOM and control characters
  return sql
    .replace(/^\uFEFF/, '') // Remove BOM
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control chars
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/--.*$/gm, '') // Remove single-line comments
    .trim();
}

async function applyMigration(filename) {
  console.log(`\n📄 Reading ${filename}...`);
  
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', filename);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${filename}`);
    return false;
  }

  let sql = fs.readFileSync(migrationPath, 'utf-8');
  sql = cleanSql(sql);

  if (!sql) {
    console.error(`❌ Empty migration file: ${filename}`);
    return false;
  }

  console.log(`📤 Applying ${filename} to Supabase...`);
  console.log(`   SQL length: ${sql.length} characters`);
  
  try {
    // Use Supabase Management API to execute SQL
    const response = await executeViaMgmtAPI(sql);
    
    if (response.success) {
      console.log(`✅ ${filename} applied successfully`);
      return true;
    } else {
      console.error(`❌ Failed: ${response.error}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Failed to apply ${filename}:`);
    console.error(error.message);
    return false;
  }
}

function executeViaMgmtAPI(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: `${projectRef}.supabase.co`,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 204) {
          resolve({ success: true });
        } else {
          resolve({ 
            success: false, 
            error: `HTTP ${res.statusCode}: ${responseData}` 
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 CRM 3.0 Migration Runner');
  console.log('================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Project Ref: ${projectRef}`);
  console.log(`Total migrations: ${MIGRATIONS.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const migration of MIGRATIONS) {
    const success = await applyMigration(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
      console.log(`\n⚠️  Migration ${migration} failed. Continuing with next migration...\n`);
    }
  }

  console.log('\n================================');
  console.log(`✅ Success: ${successCount}/${MIGRATIONS.length}`);
  console.log(`❌ Failed: ${failCount}/${MIGRATIONS.length}`);
  
  if (failCount === 0) {
    console.log('\n🎉 All migrations applied successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Update OPENAI_API_KEY in .env.local');
    console.log('   2. Run: npm run dev');
    console.log('   3. Login and test all features');
  } else {
    console.log('\n⚠️  Some migrations failed. Check errors above.');
    console.log('\n💡 Alternative: Apply migrations manually via Supabase Dashboard:');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  }
}

main().catch(error => {
  console.error('\n💥 Fatal error:');
  console.error(error);
  process.exit(1);
});
