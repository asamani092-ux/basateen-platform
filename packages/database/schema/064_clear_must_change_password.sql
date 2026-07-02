-- الدخول بالجوال فقط — إلغاء إجبار تغيير كلمة المرور
UPDATE users SET must_change_password = 0 WHERE must_change_password = 1;
