#!/bin/bash
# CRM 3.0 - Push All Migrations to Supabase
# Run with: ./push-migrations.sh

echo "🚀 CRM 3.0 Migration Push Script"
echo "================================="
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not installed!"
    echo "Install with: npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI version: $(supabase --version)"
echo ""

# Get project details
PROJECT_REF="ngvmzkavvkikisprtpgd"
PROJECT_URL="https://ngvmzkavvkikisprtpgd.supabase.co"

echo "📋 Project configuration:"
echo "   Project Ref: $PROJECT_REF"
echo "   Project URL: $PROJECT_URL"
echo ""

# Link to remote project
echo "🔗 Linking to Supabase project..."
echo "   (You may be prompted to login)"
echo ""

supabase link --project-ref $PROJECT_REF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Project linked successfully!"
    echo ""
else
    echo ""
    echo "⚠️  Already linked or login required"
    echo ""
fi

# Push all migrations
echo "📤 Pushing all migrations to database..."
echo "   This will apply all SQL files in supabase/migrations/"
echo ""

supabase db push

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All migrations pushed successfully!"
    echo ""
else
    echo ""
    echo "❌ Migration push failed!"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Make sure you're logged in: supabase login"
    echo "   2. Check your internet connection"
    echo "   3. Verify project ref is correct: $PROJECT_REF"
    echo ""
    exit 1
fi

# Success summary
echo "================================="
echo "🎉 MIGRATIONS COMPLETE!"
echo "================================="
echo ""
echo "✅ All 8 migrations applied to Supabase"
echo ""
echo "📋 Next steps:"
echo "   1. Update OPENAI_API_KEY in .env.local"
echo "   2. Run: npm run dev"
echo "   3. Open: http://localhost:3000"
echo ""
echo "📊 Verify migrations in Supabase:"
echo "   https://supabase.com/dashboard/project/$PROJECT_REF/editor"
echo ""
