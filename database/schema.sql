CREATE TABLE IF NOT EXISTS app_documents (
  file_name VARCHAR(100) NOT NULL PRIMARY KEY,
  content JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS questions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  chapter VARCHAR(100) NOT NULL,
  knowledge_points JSON NOT NULL,
  type VARCHAR(32) NOT NULL,
  difficulty VARCHAR(16) NOT NULL,
  title TEXT NOT NULL,
  options JSON NOT NULL,
  answer LONGTEXT NOT NULL,
  analysis LONGTEXT NOT NULL,
  tags JSON NOT NULL,
  source JSON NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT '待复习',
  wrong_count INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  extraction_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_questions_chapter (chapter),
  INDEX idx_questions_type (type),
  INDEX idx_questions_difficulty (difficulty),
  INDEX idx_questions_needs_review (needs_review)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires_at BIGINT UNSIGNED NOT NULL,
  session_data JSON NOT NULL,
  INDEX idx_user_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mistakes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  question_id VARCHAR(64) NOT NULL,
  wrong_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_wrong_at DATETIME NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  reason VARCHAR(200) NOT NULL DEFAULT '题库练习错误',
  UNIQUE KEY uq_mistakes_user_question (user_id, question_id),
  INDEX idx_mistakes_user_resolved (user_id, resolved),
  CONSTRAINT fk_mistakes_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS review_plans (
  user_id VARCHAR(64) NOT NULL PRIMARY KEY,
  exam_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS review_tasks (
  id VARCHAR(160) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  task_date DATE NOT NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(500) NOT NULL,
  chapter_id VARCHAR(64) NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_review_tasks_user_date (user_id, task_date),
  CONSTRAINT fk_review_tasks_plan
    FOREIGN KEY (user_id) REFERENCES review_plans(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS quiz_history (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  submitted_at DATETIME NOT NULL,
  total_score DECIMAL(10,2) NOT NULL DEFAULT 0,
  full_score DECIMAL(10,2) NOT NULL DEFAULT 0,
  accuracy INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_quiz_history_user_time (user_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  question_ids JSON NOT NULL,
  limit_minutes INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  INDEX idx_quiz_sessions_user_created (user_id, created_at),
  INDEX idx_quiz_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS quiz_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  history_id VARCHAR(64) NOT NULL,
  question_id VARCHAR(64) NOT NULL,
  stem TEXT NOT NULL,
  user_answer LONGTEXT NOT NULL,
  correct_answer LONGTEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  score DECIMAL(10,2) NOT NULL DEFAULT 0,
  full_score DECIMAL(10,2) NOT NULL DEFAULT 0,
  analysis LONGTEXT NOT NULL,
  INDEX idx_quiz_answers_history (history_id),
  CONSTRAINT fk_quiz_answers_history
    FOREIGN KEY (history_id) REFERENCES quiz_history(id) ON DELETE CASCADE,
  CONSTRAINT fk_quiz_answers_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS answer_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  question_id VARCHAR(64) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'practice',
  user_answer LONGTEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  answered_at DATETIME NOT NULL,
  INDEX idx_answer_records_user_time (user_id, answered_at),
  INDEX idx_answer_records_question (question_id),
  CONSTRAINT fk_answer_records_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS topic_progress (
  user_id VARCHAR(64) NOT NULL,
  knowledge_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT '待复习',
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_reviewed_at DATE NULL,
  PRIMARY KEY (user_id, knowledge_id),
  INDEX idx_topic_progress_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
