ALTER TABLE progress ADD COLUMN last_correct INTEGER CHECK(last_correct IN (0,1));
ALTER TABLE progress ADD COLUMN last_choice INTEGER;
UPDATE progress SET last_correct = correct WHERE last_correct IS NULL;
