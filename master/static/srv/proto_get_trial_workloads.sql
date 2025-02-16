WITH validations_vt AS (
  SELECT row_to_json(r1) AS validation, total_batches, end_time
  FROM (
      SELECT 'STATE_' || v.state as state,
        v.end_time,
        v.total_batches,
        v.metrics->'num_inputs' as num_inputs,
        v.metrics->'validation_metrics' as metrics
      FROM validations v
      WHERE v.trial_id = $1
    ) AS r1
),
trainings_vt AS (
  SELECT row_to_json(r1) AS training, total_batches, end_time
  FROM (
      SELECT s.end_time,
        'STATE_' || s.state as state,
        s.metrics->'avg_metrics' as metrics,
        s.metrics->'num_inputs' as num_inputs,
        s.total_batches
      FROM steps s
      WHERE s.trial_id = $1
    ) AS r1
),
checkpoints_vt AS (
  SELECT row_to_json(r1) AS checkpoint, total_batches, end_time
  FROM (
      SELECT
        'STATE_' || c.state AS state,
        c.report_time as end_time,
        c.uuid,
        c.steps_completed as total_batches,
        c.resources
      FROM checkpoints_view c
      WHERE c.trial_id = $1
    ) AS r1
),
workloads AS (
  SELECT v.validation::jsonb AS validation,
    t.training::jsonb AS training,
    c.checkpoint::jsonb AS checkpoint,
    coalesce(
      t.total_batches,
      v.total_batches,
      c.total_batches
    ) AS total_batches,
    coalesce(
      t.end_time,
      v.end_time,
      c.end_time
    ) AS end_time
  FROM trainings_vt t
    FULL JOIN checkpoints_vt c ON false
    FULL JOIN validations_vt v ON false
),
page_info AS (
  SELECT public.page_info((SELECT COUNT(*) AS count FROM workloads), $2 :: int, $3 :: int) AS page_info
)
SELECT (
  SELECT jsonb_agg(w) FROM (SELECT validation, training, checkpoint FROM workloads
    ORDER BY total_batches %s, end_time %s
    OFFSET (SELECT p.page_info->>'start_index' FROM page_info p)::bigint
    LIMIT (SELECT (p.page_info->>'end_index')::bigint - (p.page_info->>'start_index')::bigint FROM page_info p)
  ) w
) AS workloads,
  (SELECT p.page_info FROM page_info p) as pagination
