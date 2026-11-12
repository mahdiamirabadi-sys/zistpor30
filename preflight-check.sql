-- بررسی فقط خواندنی: آیا جدول یا تابع آزمون از قبل وجود دارد؟
SELECT
  'TABLE_COLUMN' AS item_type,
  table_name AS item_name,
  column_name AS detail_1,
  data_type AS detail_2
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('exam_sessions', 'exam_session_questions')

UNION ALL

SELECT
  'FUNCTION' AS item_type,
  n.nspname || '.' || p.proname AS item_name,
  pg_get_function_identity_arguments(p.oid) AS detail_1,
  pg_get_function_result(p.oid) AS detail_2
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'porseman_private')
  AND p.proname IN (
    'start_exam',
    'submit_exam_answer',
    'finish_exam',
    'cancel_exam',
    'cancel_my_active_exam'
  )
ORDER BY item_type, item_name, detail_1;
