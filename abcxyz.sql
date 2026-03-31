SELECT 
    abc_category,
    xyz_category,
    abc_category || xyz_category as matrix,
    COUNT(*) as too
FROM products
WHERE abc_category IS NOT NULL
GROUP BY abc_category, xyz_category
ORDER BY abc_category, xyz_category;
