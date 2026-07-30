UPDATE users
SET role = CASE
  WHEN lower(email) = 'zy98970@gmail.com' THEN 'admin'
  ELSE 'user'
END;
