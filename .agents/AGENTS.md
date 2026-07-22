
# Next.js Build Rule

**CRITICAL RULE:** Do NOT run 
pm run build or 
ext build as a background task to validate code while developing, as this wipes the .next directory and causes the running Next.js dev server to return 404s for all routes. Instead, always use 
px tsc --noEmit to validate TypeScript compilation.
