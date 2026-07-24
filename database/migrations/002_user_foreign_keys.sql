INSERT INTO review_plans (user_id, exam_date, created_at, updated_at)
SELECT 'user-demo', legacy.exam_date, legacy.created_at, legacy.updated_at
FROM review_plans legacy
JOIN users target ON target.id = 'user-demo'
WHERE legacy.user_id = 'guest'
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);

UPDATE review_tasks tasks
JOIN users target ON target.id = 'user-demo'
SET tasks.user_id = 'user-demo'
WHERE tasks.user_id = 'guest';

DELETE FROM review_plans WHERE user_id = 'guest';

INSERT INTO mistakes
  (user_id, question_id, wrong_count, last_wrong_at, resolved, reason)
SELECT
  'user-demo', legacy.question_id, legacy.wrong_count,
  legacy.last_wrong_at, legacy.resolved, legacy.reason
FROM mistakes legacy
JOIN users target ON target.id = 'user-demo'
WHERE legacy.user_id = 'guest'
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);

DELETE FROM mistakes WHERE user_id = 'guest';

UPDATE quiz_history records
JOIN users target ON target.id = 'user-demo'
SET records.user_id = 'user-demo'
WHERE records.user_id = 'guest';

UPDATE quiz_sessions records
JOIN users target ON target.id = 'user-demo'
SET records.user_id = 'user-demo'
WHERE records.user_id = 'guest';

UPDATE answer_records records
JOIN users target ON target.id = 'user-demo'
SET records.user_id = 'user-demo'
WHERE records.user_id = 'guest';

INSERT INTO topic_progress
  (user_id, knowledge_id, status, review_count, last_reviewed_at)
SELECT
  'user-demo', legacy.knowledge_id, legacy.status,
  legacy.review_count, legacy.last_reviewed_at
FROM topic_progress legacy
JOIN users target ON target.id = 'user-demo'
WHERE legacy.user_id = 'guest'
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);

DELETE FROM topic_progress WHERE user_id = 'guest';

ALTER TABLE mistakes
  ADD CONSTRAINT fk_mistakes_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE review_plans
  ADD CONSTRAINT fk_review_plans_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE quiz_history
  ADD CONSTRAINT fk_quiz_history_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE quiz_sessions
  ADD CONSTRAINT fk_quiz_sessions_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE answer_records
  ADD CONSTRAINT fk_answer_records_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE topic_progress
  ADD CONSTRAINT fk_topic_progress_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
