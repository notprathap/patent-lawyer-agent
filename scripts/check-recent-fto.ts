import { config } from 'dotenv';
config();
import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const id = process.argv[2] ?? 'cmok5vc200000ney9dl00z34n';
  const rows = await sql`
    SELECT id, "analysisType", status, "targetMarkets",
           "discoveredPatents", "parsedProduct" -> 'features' as features,
           "parsedProduct" -> 'industry' as industry,
           jsonb_array_length(("parsedProduct" -> 'features')) as feature_count,
           "reflectionNotes",
           length("productDescription") as desc_len
    FROM "Analysis"
    WHERE id = ${id}
  `;
  for (const r of rows) {
    console.log('id:', r.id);
    console.log('targetMarkets:', r.targetMarkets);
    console.log('industry:', r.industry);
    console.log('feature count:', r.feature_count);
    console.log('desc length:', r.desc_len);
    console.log('reflectionNotes:', r.reflectionNotes?.slice(0, 800));
    const dp = r.discoveredPatents as any;
    console.log('\nDiscovered patents report:');
    console.log('  patents:', dp?.patents?.length ?? 0);
    console.log('  searchQueries:', dp?.searchQueries);
    console.log('  sourcesSearched:', dp?.sourcesSearched);
    console.log('  totalFound:', dp?.totalFound);
    console.log('\nFirst 5 features:');
    const feats = r.features as any[];
    feats?.slice(0, 5).forEach((f: any) => console.log(`  - [${f.id}] (${f.type}) ${f.text}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
