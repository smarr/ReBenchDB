-- remove the timeline-related database objects
-- they are not needed anymore, because we do everything inside of Node
DROP TABLE IF EXISTS TimelineCalcJob;
DROP SEQUENCE IF EXISTS TimelineJobId;
