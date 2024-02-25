-- Remove the Unit table
ALTER TABLE Criterion DROP CONSTRAINT IF EXISTS criterion_unit_fkey;
DROP TABLE Unit;
