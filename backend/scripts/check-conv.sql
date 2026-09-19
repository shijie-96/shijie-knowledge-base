SELECT id, title,
       LEFT("originalText", 400) AS original_preview,
       LENGTH("originalText") AS original_len,
       LEFT("summary", 400) AS summary_preview,
       LENGTH("summary") AS summary_len,
       "createdAt"
FROM source_material
WHERE "sourceType" = 'conversation'
  AND "deletedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 3;