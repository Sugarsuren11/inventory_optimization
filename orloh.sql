-- Орлох дүрэм огт байна уу?
SELECT
    COUNT(*) as niit,
    COUNT(CASE WHEN lift >= 1 THEN 1 END) as dagaldah,
    COUNT(CASE WHEN lift < 1 THEN 1 END) as orloh,
    MIN(lift) as min_lift,
    MAX(lift) as max_lift,
    AVG(lift) as avg_lift
FROM association_rules;
