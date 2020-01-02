CREATE TABLE SchemaVersion (
  updateDate timestamp with time zone,
  version smallint primary key
);

INSERT INTO SchemaVersion (version, updateDate) VALUES (1, now());

ALTER TABLE Project ADD COLUMN showChanges bool DEFAULT true;

ALTER TABLE Project ADD COLUMN allResults bool DEFAULT false;

UPDATE Project SET showChanges = true, allResults = false WHERE name = 'SOMns';
UPDATE Project SET showChanges = false, allResults = true WHERE name = 'ReBenchDB Self-Tracking';

CREATE TABLE Timeline (
  runId smallint,
  trialId smallint,
  criterion smallint,

  numSamples smallint,

  minVal float4,
  maxVal float4,
  sdVal  float4,
  mean   float4,
  median float4,

  -- bootstrap confidence interval 95%-tile
  bci95low float4,
  bci95up  float4,

  primary key (runId, trialId, criterion),
  foreign key (trialId) references Trial (id),
  foreign key (runId) references Run (id),
  foreign key (criterion) references Criterion (id)
);
