-- Tells Flyway that V1 (01_schema.sql) is already applied, so the backend starts
-- cleanly on a database you imported by hand. (The app also auto-baselines,
-- this just makes it explicit.)
CREATE TABLE IF NOT EXISTS flyway_schema_history (
    installed_rank INT NOT NULL PRIMARY KEY,
    version        VARCHAR(50),
    description    VARCHAR(200) NOT NULL,
    type           VARCHAR(20)  NOT NULL,
    script         VARCHAR(1000) NOT NULL,
    checksum       INT,
    installed_by   VARCHAR(100) NOT NULL,
    installed_on   TIMESTAMP    NOT NULL DEFAULT now(),
    execution_time INT          NOT NULL,
    success        BOOLEAN      NOT NULL
);
CREATE INDEX IF NOT EXISTS flyway_schema_history_s_idx ON flyway_schema_history (success);
INSERT INTO flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
SELECT 1, '1', '<< Flyway Baseline >>', 'BASELINE', '<< Flyway Baseline >>', NULL, current_user, 0, TRUE
WHERE NOT EXISTS (SELECT 1 FROM flyway_schema_history);
