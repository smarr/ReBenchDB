SELECT count(*) as cnt, value, criterion, c.name, c.unit FROM Measurement JOIN Criterion c ON c.id = criterion  GROUP BY criterion, value, c.name, c.unit HAVING count(value) > 1000 ORDER BY cnt DESC, criterion ASC;

DELETE FROM Measurement WHERE criterion = 2 AND value = 0;
DELETE FROM Measurement WHERE criterion = 3 AND value = 0;