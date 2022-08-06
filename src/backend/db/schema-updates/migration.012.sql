BEGIN;
-- create temporary table
CREATE TABLE TempMeasurement(
    runId smallint NOT NULL,
    trialId smallint NOT NULL,
    criterion smallint NOT NULL,
    invocation smallint NOT NULL,
    value float4[] NOT NULL,
    PRIMARY KEY(runId,trialId,criterion,invocation)
);
-- order the measurement table by primary key, then insert into the new temporary table the aggregate of value for iteration
INSERT INTO TempMeasurement(runId, trialId, criterion, invocation,value)
  WITH iterations AS(
    SELECT runId, trialId, criterion, invocation, iteration, value 
    FROM Measurement 
    ORDER BY runId, trialId, criterion, invocation, iteration ASC)
  SELECT runId, trialId, criterion, invocation, array_agg(value) AS arrayOfValues 
  FROM iterations
  GROUP BY runId, trialId, criterion, invocation ;

-- drop the old measurement table
DROP TABLE Measurement;

-- rename temporary table to be measurement table
ALTER TABLE TempMeasurement
  RENAME TO Measurement;
COMMIT;
