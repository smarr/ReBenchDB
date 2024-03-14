-- First Create an index that helps with the data migration
CREATE INDEX runid_trialid_criterion_invocation_idx
  ON Measurement (runId, trialId, criterion, invocation);

-- create a temporary table to hold the new measurement data

TODO: all queries everywhere..., try JOIN USING instead of JOIN ON

CREATE TABLE TempMeasurement AS
	WITH
	  series_details AS (
	  	SELECT runId, trialId, criterion, invocation, max(iteration)
	  	FROM Measurement
	  	GROUP BY runId, trialId, criterion, invocation
	  )
	SELECT
		sd.runId, sd.trialId, sd.criterion, sd.invocation,
       	array_agg(value order by i) as values
	FROM series_details sd
	CROSS JOIN generate_series(1, max::INTEGER) as g(i)
	LEFT JOIN Measurement m ON
			m.iteration=g.i
        AND m.runId = sd.runId
        AND m.trialId = sd.trialId
        AND m.criterion = sd.criterion
        AND m.invocation = sd.invocation
	GROUP BY sd.runId, sd.trialId, sd.criterion, sd.invocation;


TODO:
also add CREATE PROCEDURE recordAdditionalMeasurement(

BEGIN;
-- create temporary table
CREATE TABLE TempMeasurement(
    runId smallint NOT NULL,
    trialId smallint NOT NULL,
    criterion smallint NOT NULL,
    invocation smallint NOT NULL,
    values float4[] NOT NULL,
    primary key(invocation, runId, trialId, criterion)
);

-- insert empty values arrays into the new temporary table
-- based on the invocations in the Measurement table
INSERT INTO TempMeasurement(runId, trialId, criterion, invocation, values)
  SELECT runId, trialId, criterion, invocation, '{}'::float4[]
  FROM Measurement
  ON CONFLICT DO NOTHING;

-- take the data from Measurement and put it into the values array at the
-- index indicated by the iteration
-- for some reason, the explicit loop makes it work
-- otherwise, only the last value is inserted
DO
$do$
BEGIN
   FOR i IN 1..(SELECT max(iteration) FROM Measurement m) LOOP
      UPDATE TempMeasurement tm
	  SET values[i] = m.value
	  FROM Measurement m
	  WHERE
	    tm.runId      = m.runId AND
	    tm.trialId    = m.trialId AND
	    tm.criterion  = m.criterion AND
	    tm.invocation = m.invocation AND
	    m.iteration=i;
   END LOOP;
END
$do$;

UPDATE TempMeasurement tm
  SET values[iteration] = m.value
  FROM Measurement m
  WHERE
    tm.runId = m.runId AND
    tm.trialId = m.trialId AND
    tm.criterion = m.criterion AND
    tm.invocation = m.invocation;

-- order the measurement table by primary key, then insert into the new temporary table the aggregate of value for iteration
INSERT INTO TempMeasurement(runId, trialId, criterion, invocation, values)
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
